import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { config } from '../../config';
import { captureEvent, Events, identifyUser } from '../../services/analytics/posthog';
import { sendEmail, wrapEmailTemplate } from '../../services/email/email-service';

const authRoutes: FastifyPluginAsync = async (fastify) => {
  // Register
  fastify.post('/register', async (request, reply) => {
    const schema = z.object({
      email: z.string().email(),
      password: z.string().min(8),
      name: z.string().min(1),
    });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      const errors = parsed.error.issues.map(i => ({ field: i.path.join('.'), message: i.message }));
      return reply.status(400).send({ success: false, error: 'Validation failed', errors });
    }
    const body = parsed.data;
    
    const existing = await fastify.prisma.user.findUnique({
      where: { email: body.email },
    });
    if (existing) {
      return reply.status(409).send({ success: false, error: 'Email already registered' });
    }
    
    const passwordHash = await bcrypt.hash(body.password, 12);
    
    const user = await fastify.prisma.user.create({
      data: {
        email: body.email,
        name: body.name,
        passwordHash,
      },
      select: { id: true, email: true, name: true, role: true, createdAt: true },
    });
    
    // Generate email verification token
    const verifyToken = crypto.randomBytes(32).toString('hex');
    const verifyTokenHash = await bcrypt.hash(verifyToken, 10);
    
    await fastify.prisma.user.update({
      where: { id: user.id },
      data: { verifyToken: verifyTokenHash, verifyTokenExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) },
    });

    const token = fastify.jwt.sign({ id: user.id, email: user.email });

    // Send verification email (non-blocking — registration succeeds even if email fails)
    try {
      const verifyUrl = `${config.frontendUrl}/verify-email?token=${verifyToken}&userId=${user.id}`;
      await sendEmail({
        to: body.email,
        subject: 'Verify your MetaPilot AI account',
        html: wrapEmailTemplate(
          'Welcome to MetaPilot AI! 🚀',
          `<p>Hi ${body.name},</p>
           <p>Thanks for signing up! Please verify your email address by clicking the button below:</p>
           <p style="text-align: center; margin: 32px 0;">
             <a href="${verifyUrl}" class="btn">Verify Email Address</a>
           </p>
           <p>This link expires in 24 hours. If you didn't create an account, you can ignore this email.</p>
           <p style="color: #9ca3af; font-size: 12px;">Or copy this link: ${verifyUrl}</p>`,
        ),
      });
    } catch (emailErr) {
      console.warn('[Auth] Failed to send verification email:', (emailErr as Error)?.message || emailErr);
      // Non-blocking: registration still succeeds
    }

    // Track signup
    captureEvent(user.id, Events.USER_SIGNED_UP, { email: user.email, method: 'email' });
    identifyUser(user.id, { email: user.email, name: user.name });

    return {
      success: true,
      data: { user, token },
      message: 'Account created! Please check your email to verify your address.',
    };
  });

  // ── Email Verification ──
  fastify.post('/verify-email', async (request, reply) => {
    const schema = z.object({
      userId: z.string(),
      token: z.string(),
    });
    const body = schema.parse(request.body);

    const user = await fastify.prisma.user.findUnique({
      where: { id: body.userId },
      select: { id: true, verifyToken: true, verifyTokenExpiresAt: true, emailVerified: true },
    });

    if (!user || !user.verifyToken) {
      return reply.status(400).send({ success: false, error: 'Invalid verification link.' });
    }

    if (user.emailVerified) {
      return { success: true, data: { verified: true, message: 'Email already verified.' } };
    }

    if (user.verifyTokenExpiresAt && user.verifyTokenExpiresAt < new Date()) {
      return reply.status(400).send({
        success: false,
        error: 'Verification link has expired. Please request a new one.',
      });
    }

    const valid = await bcrypt.compare(body.token, user.verifyToken);
    if (!valid) {
      return reply.status(400).send({ success: false, error: 'Invalid verification token.' });
    }

    await fastify.prisma.user.update({
      where: { id: body.userId },
      data: {
        emailVerified: true,
        verifyToken: null,
        verifyTokenExpiresAt: null,
      },
    });

    captureEvent(body.userId, Events.USER_EMAIL_VERIFIED, {});

    return { success: true, data: { verified: true } };
  });

  // ── Resend Verification Email ──
  fastify.post('/resend-verification', async (request, reply) => {
    const schema = z.object({ email: z.string().email() });
    const { email } = schema.parse(request.body);

    const user = await fastify.prisma.user.findUnique({
      where: { email },
      select: { id: true, emailVerified: true, name: true },
    });

    if (!user) {
      // Don't reveal whether the email exists
      return { success: true, data: { sent: true } };
    }

    if (user.emailVerified) {
      return { success: true, data: { sent: true, message: 'Email already verified.' } };
    }

    const verifyToken = crypto.randomBytes(32).toString('hex');
    const verifyTokenHash = await bcrypt.hash(verifyToken, 10);

    await fastify.prisma.user.update({
      where: { id: user.id },
      data: { verifyToken: verifyTokenHash, verifyTokenExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) },
    });

    try {
      const verifyUrl = `${config.frontendUrl}/verify-email?token=${verifyToken}&userId=${user.id}`;
      await sendEmail({
        to: email,
        subject: 'Verify your MetaPilot AI account',
        html: wrapEmailTemplate(
          'Email Verification',
          `<p>Hi ${user.name || 'there'},</p>
           <p>Here's a fresh verification link:</p>
           <p style="text-align: center; margin: 32px 0;">
             <a href="${verifyUrl}" class="btn">Verify Email Address</a>
           </p>
           <p>This link expires in 24 hours.</p>`,
        ),
      });
    } catch (emailErr) {
      console.warn('[Auth] Failed to resend verification email:', (emailErr as Error)?.message || emailErr);
    }

    return { success: true, data: { sent: true } };
  });

  // ── Forgot Password ──
  fastify.post('/forgot-password', async (request) => {
    const schema = z.object({ email: z.string().email() });
    const { email } = schema.parse(request.body);

    const user = await fastify.prisma.user.findUnique({
      where: { email },
      select: { id: true, name: true },
    });

    // Always return success to prevent email enumeration
    if (!user) {
      return { success: true, data: { sent: true } };
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenHash = await bcrypt.hash(resetToken, 10);

    await fastify.prisma.user.update({
      where: { id: user.id },
      data: {
        resetToken: resetTokenHash,
        resetTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
      },
    });

    try {
      const resetUrl = `${config.frontendUrl}/reset-password?token=${resetToken}&userId=${user.id}`;
      await sendEmail({
        to: email,
        subject: 'Reset your MetaPilot AI password',
        html: wrapEmailTemplate(
          'Password Reset Request',
          `<p>Hi ${user.name || 'there'},</p>
           <p>We received a request to reset your password. Click the button below to set a new one:</p>
           <p style="text-align: center; margin: 32px 0;">
             <a href="${resetUrl}" class="btn">Reset Password</a>
           </p>
           <p>This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>
           <p style="color: #9ca3af; font-size: 12px;">Or copy this link: ${resetUrl}</p>`,
        ),
      });
    } catch (emailErr) {
      console.warn('[Auth] Failed to send password reset email:', (emailErr as Error)?.message || emailErr);
    }

    return { success: true, data: { sent: true } };
  });

  // ── Reset Password ──
  fastify.post('/reset-password', async (request, reply) => {
    const schema = z.object({
      userId: z.string(),
      token: z.string(),
      password: z.string().min(8),
    });
    const body = schema.parse(request.body);

    const user = await fastify.prisma.user.findUnique({
      where: { id: body.userId },
      select: { id: true, resetToken: true, resetTokenExpiresAt: true },
    });

    if (!user || !user.resetToken) {
      return reply.status(400).send({ success: false, error: 'Invalid or expired reset link.' });
    }

    if (user.resetTokenExpiresAt && user.resetTokenExpiresAt < new Date()) {
      return reply.status(400).send({ success: false, error: 'Reset link has expired. Please request a new one.' });
    }

    const valid = await bcrypt.compare(body.token, user.resetToken);
    if (!valid) {
      return reply.status(400).send({ success: false, error: 'Invalid reset token.' });
    }

    const passwordHash = await bcrypt.hash(body.password, 12);
    await fastify.prisma.user.update({
      where: { id: body.userId },
      data: {
        passwordHash,
        resetToken: null,
        resetTokenExpiresAt: null,
      },
    });

    captureEvent(body.userId, Events.USER_PASSWORD_RESET, {});

    return { success: true, data: { reset: true } };
  });

  // Login
  fastify.post('/login', async (request, reply) => {
    const schema = z.object({
      email: z.string().email(),
      password: z.string(),
    });
    const body = schema.parse(request.body);
    
    const user = await fastify.prisma.user.findUnique({
      where: { email: body.email },
    });
    if (!user?.passwordHash) {
      return reply.status(401).send({ success: false, error: 'Invalid credentials' });
    }
    
    const valid = await bcrypt.compare(body.password, user.passwordHash);
    if (!valid) {
      return reply.status(401).send({ success: false, error: 'Invalid credentials' });
    }
    
    const token = fastify.jwt.sign({ id: user.id, email: user.email });

    // Track login
    captureEvent(user.id, Events.USER_LOGGED_IN, { email: user.email });

    return {
      success: true,
      data: {
        user: { id: user.id, email: user.email, name: user.name, role: user.role },
        token,
      },
    };
  });

  // Me
  fastify.get('/me', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const { userId } = await (request as any).authenticate();
    const user = await fastify.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, avatar: true, role: true, onboardingStep: true, onboardingDone: true, emailVerified: true, createdAt: true },
    });
    return { success: true, data: user };
  });

  // Google OAuth
  fastify.post('/google', async (request, reply) => {
    const schema = z.object({ idToken: z.string() });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: 'idToken is required' });
    }
    const { idToken } = parsed.data;

    try {
      // Dynamically import google-auth-library to avoid heavy deps when not used
      const { OAuth2Client } = await import('google-auth-library');
      const client = new OAuth2Client(config.google.clientId);

      const ticket = await client.verifyIdToken({
        idToken,
        audience: config.google.clientId,
      });

      const payload = ticket.getPayload();
      if (!payload || !payload.email) {
        return reply.status(401).send({ success: false, error: 'Invalid Google token' });
      }

      const googleId = payload.sub;
      const email = payload.email;
      const name = payload.name || email.split('@')[0];
      const avatar = payload.picture || undefined;

      // Find or create user
      const existingUser = await fastify.prisma.user.findFirst({
        where: { OR: [{ googleId }, { email }] },
      });

      let userData: {
        id: string;
        email: string;
        name: string | null;
        avatar: string | null;
        role: string;
        onboardingStep: string;
        onboardingDone: boolean;
      };

      if (existingUser) {
        // Link Google ID if not already linked
        if (!existingUser.googleId) {
          userData = await fastify.prisma.user.update({
            where: { id: existingUser.id },
            data: { googleId, avatar: avatar || existingUser.avatar },
            select: { id: true, email: true, name: true, avatar: true, role: true, onboardingStep: true, onboardingDone: true },
          });
        } else {
          userData = {
            id: existingUser.id,
            email: existingUser.email,
            name: existingUser.name || '',
            avatar: existingUser.avatar,
            role: existingUser.role,
            onboardingStep: existingUser.onboardingStep,
            onboardingDone: existingUser.onboardingDone,
          };
        }
      } else {
        userData = await fastify.prisma.user.create({
          data: { email, name, googleId, avatar, emailVerified: true }, // Google-authed emails are pre-verified
          select: { id: true, email: true, name: true, avatar: true, role: true, onboardingStep: true, onboardingDone: true },
        });
      }

      const token = fastify.jwt.sign({ id: userData.id, email: userData.email });

      // Track Google signup/login
      if (existingUser) {
        captureEvent(userData.id, Events.USER_LOGGED_IN, { email: userData.email, method: 'google' });
      } else {
        captureEvent(userData.id, Events.USER_SIGNED_UP, { email: userData.email, method: 'google' });
        identifyUser(userData.id, { email: userData.email, name: userData.name });
      }

      return { success: true, data: { user: userData, token } };
    } catch (err: any) {
      fastify.log.error('Google OAuth error:', err?.message || err);
      return reply.status(401).send({ success: false, error: 'Google authentication failed' });
    }
  });
};

export default authRoutes;
