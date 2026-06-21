/**
 * MetaPilot AI — Partner Portal Auth
 *
 * Dedicated auth for partners (no public registration — admin creates partners).
 * JWT includes role=partner and partnerId claims.
 */

import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { config } from '../../config';
import { sendEmail, wrapEmailTemplate } from '../../services/email/email-service';
import { captureEvent, Events } from '../../services/analytics/posthog';

const partnerAuthRoutes: FastifyPluginAsync = async (fastify) => {
  // ── Partner Login ──
  fastify.post('/login', async (request, reply) => {
    const schema = z.object({
      email: z.string().email(),
      password: z.string(),
    });
    const body = schema.parse(request.body);

    const user = await fastify.prisma.user.findUnique({
      where: { email: body.email },
    });

    if (!user?.passwordHash || user.role !== 'partner') {
      return reply.status(401).send({ success: false, error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(body.password, user.passwordHash);
    if (!valid) {
      return reply.status(401).send({ success: false, error: 'Invalid credentials' });
    }

    const partner = await fastify.prisma.partner.findFirst({
      where: { partnerUserId: user.id, status: 'active' },
    });

    if (!partner) {
      return reply.status(403).send({
        success: false,
        error: 'No active partner account linked to this user. Contact your admin.',
      });
    }

    const token = fastify.jwt.sign({
      id: user.id,
      email: user.email,
      role: 'partner',
      partnerId: partner.id,
    });

    captureEvent(user.id, Events.USER_LOGGED_IN, { email: user.email, portal: 'partner' });

    return {
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: 'partner',
          partnerId: partner.id,
        },
        partner: {
          id: partner.id,
          name: partner.name,
          city: partner.city,
          commissionRate: partner.commissionRate,
        },
        token,
      },
    };
  });

  // ── Partner Session (Me) ──
  fastify.get('/me', { preHandler: [fastify.authenticatePartner as any] }, async (request) => {
    const auth = await (request as any).authenticatePartner();

    const partner = await fastify.prisma.partner.findUnique({
      where: { id: auth.partnerId },
      select: {
        id: true,
        name: true,
        email: true,
        city: true,
        territory: true,
        commissionRate: true,
        status: true,
      },
    });

    const user = await fastify.prisma.user.findUnique({
      where: { id: auth.userId },
      select: { id: true, email: true, name: true, emailVerified: true },
    });

    return { success: true, data: { user, partner } };
  });

  // ── Forgot Password ──
  fastify.post('/forgot-password', async (request) => {
    const schema = z.object({ email: z.string().email() });
    const { email } = schema.parse(request.body);

    const user = await fastify.prisma.user.findUnique({
      where: { email },
      select: { id: true, name: true, role: true },
    });

    if (!user || user.role !== 'partner') {
      return { success: true, data: { sent: true } };
    }

    const partner = await fastify.prisma.partner.findFirst({
      where: { partnerUserId: user.id },
      select: { id: true },
    });

    if (!partner) {
      return { success: true, data: { sent: true } };
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenHash = await bcrypt.hash(resetToken, 10);

    await fastify.prisma.user.update({
      where: { id: user.id },
      data: {
        resetToken: resetTokenHash,
        resetTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    try {
      const resetUrl = `${config.frontendUrl}/reset-password?token=${resetToken}&userId=${user.id}&portal=partner`;
      await sendEmail({
        to: email,
        subject: 'Reset your KluConnect Partner Portal password',
        html: wrapEmailTemplate(
          'Partner Password Reset',
          `<p>Hi ${user.name || 'Partner'},</p>
           <p>We received a request to reset your partner portal password:</p>
           <p style="text-align: center; margin: 32px 0;">
             <a href="${resetUrl}" class="btn">Reset Password</a>
           </p>
           <p>This link expires in 1 hour.</p>`,
        ),
      });
    } catch (emailErr) {
      console.warn('[PartnerAuth] Failed to send reset email:', (emailErr as Error)?.message || emailErr);
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
      select: { id: true, role: true, resetToken: true, resetTokenExpiresAt: true },
    });

    if (!user || user.role !== 'partner' || !user.resetToken) {
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

    captureEvent(body.userId, Events.USER_PASSWORD_RESET, { portal: 'partner' });

    return { success: true, data: { reset: true } };
  });
};

export default partnerAuthRoutes;
