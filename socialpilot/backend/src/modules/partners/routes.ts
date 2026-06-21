/**
 * MetaPilot AI — Partner Distribution System
 *
 * Enables city-level partners to manage customers, earn commissions,
 * and track MRR generated from their referrals.
 *
 * GET    /api/partners            — List partners (admin)
 * POST   /api/partners            — Create partner (admin)
 * PUT    /api/partners/:id        — Update partner
 * GET    /api/partners/:id        — Get partner with stats
 * GET    /api/partners/:id/clients — Customers assigned to partner
 * GET    /api/partners/portal     — Partner portal: their own dashboard
 *
 * Commission Logic:
 * - Partners earn commission % on MRR from customers they manage
 * - Commission = sum(recurring_revenue) * (commissionRate / 100)
 * - Tracked monthly via subscription.razorpayCustomerId → partner mapping
 */

import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { config } from '../../config';
import { captureEvent, Events } from '../../services/analytics/posthog';

const partnerRoutes: FastifyPluginAsync = async (fastify) => {
  // ── List Partners (Admin) ──
  fastify.get(
    '/',
    { preHandler: [fastify.authenticate as any] },
    async (request) => {
      const { userId, role } = await (request as any).authenticate();

      // Only owners/admins can list all partners
      if (role !== 'owner' && role !== 'admin') {
        return { success: false, error: 'Unauthorized. Admin access required.' };
      }

      const partners = await fastify.prisma.partner.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        include: {
          _count: { select: { customers: true } },
        },
      });

      // Enrich with MRR and commission data
      const enriched = await Promise.all(partners.map(async (p: any) => {
        const customers = await fastify.prisma.user.findMany({
          where: { referredByPartner: p.id },
          include: {
            subscription: { select: { plan: true, status: true } },
          },
        });

        const activeCustomers = customers.filter((c: any) => c.subscription?.status === 'active');
        const mrr = activeCustomers.reduce((sum: number, c: any) => {
          const prices: Record<string, number> = { starter: 2900, professional: 7900, agency: 19900 };
          return sum + (prices[c.subscription?.plan || ''] || 0);
        }, 0);

        return {
          id: p.id,
          name: p.name,
          city: p.city,
          territory: p.territory,
          commissionRate: p.commissionRate,
          customerCount: p._count.customers,
          activeCustomerCount: activeCustomers.length,
          mrr,
          commissionEarned: Math.round(mrr * (p.commissionRate / 100)),
          createdAt: p.createdAt,
          status: p.status,
        };
      }));

      return { success: true, data: enriched };
    },
  );

  // ── Create Partner ──
  fastify.post(
    '/',
    { preHandler: [fastify.authenticate as any] },
    async (request, reply) => {
      const { userId, role } = await (request as any).authenticate();
      if (role !== 'owner' && role !== 'admin') {
        return reply.status(403).send({ success: false, error: 'Unauthorized' });
      }

      const schema = z.object({
        name: z.string().min(1),
        email: z.string().email(),
        phone: z.string().optional(),
        city: z.string().optional(),
        territory: z.string().optional(),
        commissionRate: z.number().min(0).max(100).default(10),
      });

      const body = schema.parse(request.body);

      // Look for existing user with this email to link partner account
      const existingUser = await fastify.prisma.user.findUnique({
        where: { email: body.email },
        select: { id: true },
      });
      let partnerUserId: string | null = null;

      if (existingUser) {
        partnerUserId = existingUser.id;
      } else {
        // Create a user account for the partner with a random password
        const tempPassword = crypto.randomBytes(16).toString('hex');
        const passwordHash = await bcrypt.hash(tempPassword, 12);
        const newUser = await fastify.prisma.user.create({
          data: {
            email: body.email,
            name: body.name,
            passwordHash,
            role: 'partner',
          },
          select: { id: true },
        });
        partnerUserId = newUser.id;
      }

      const partner = await fastify.prisma.partner.create({
        data: {
          userId,
          partnerUserId,
          name: body.name,
          email: body.email,
          phone: body.phone || null,
          city: body.city || null,
          territory: body.territory || null,
          commissionRate: body.commissionRate,
          status: 'active',
        },
      });

      // Send welcome email with instructions to set password
      if (!existingUser) {
        const { sendEmail, wrapEmailTemplate } = await import('../../services/email/email-service');
        const setPasswordUrl = `${config.frontendUrl}/reset-password?userId=${partnerUserId}&firstTime=true`;
        await sendEmail({
          to: body.email,
          subject: 'You\'ve been added as a KluConnect Partner!',
          html: wrapEmailTemplate(
            'Welcome to the Partner Program! 🎉',
            `<p>Hi ${body.name},</p>
             <p>You've been added as a partner for KluConnect. You can now access your partner portal to track clients, MRR, and commissions.</p>
             <p style="text-align: center; margin: 32px 0;">
               <a href="${setPasswordUrl}" class="btn">Set Your Password</a>
             </p>
             <p>Your email: <strong>${body.email}</strong></p>
             <p>Once you set your password, you can log in at ${config.frontendUrl} and visit the Partner Portal.</p>`,
          ),
        });
      }

      // Update user role if not already done
      if (existingUser) {
        await fastify.prisma.user.update({
          where: { id: existingUser.id },
          data: { role: 'partner' },
        });
      }

      captureEvent(userId, Events.PARTNER_CREATED, {
        partnerId: partner.id,
        name: partner.name,
        commissionRate: partner.commissionRate,
      });

      return { success: true, data: partner };
    },
  );

  // ── Update Partner ──
  fastify.put(
    '/:id',
    { preHandler: [fastify.authenticate as any] },
    async (request, reply) => {
      const { userId, role } = await (request as any).authenticate();
      if (role !== 'owner' && role !== 'admin') {
        return reply.status(403).send({ success: false, error: 'Unauthorized' });
      }

      const { id } = request.params as { id: string };

      const schema = z.object({
        name: z.string().min(1).optional(),
        email: z.string().email().optional(),
        phone: z.string().optional(),
        city: z.string().optional(),
        territory: z.string().optional(),
        commissionRate: z.number().min(0).max(100).optional(),
        status: z.enum(['active', 'inactive']).optional(),
      });

      const body = schema.parse(request.body);

      const partner = await fastify.prisma.partner.update({
        where: { id, userId },
        data: body,
      });

      return { success: true, data: partner };
    },
  );

  // ── Get Partner Details ──
  fastify.get(
    '/:id',
    { preHandler: [fastify.authenticate as any] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const jwtUser = (request as any).user as { id?: string; role?: string; partnerId?: string };

      // Partner-scoped JWT: only own record
      if (jwtUser.role === 'partner' && jwtUser.partnerId) {
        if (jwtUser.partnerId !== id) {
          return reply.status(403).send({ success: false, error: 'Unauthorized' });
        }
        const partnerAuth = await (request as any).authenticatePartner();
        const partner = await fastify.prisma.partner.findFirst({
          where: { id: partnerAuth.partnerId, partnerUserId: partnerAuth.userId },
        });
        if (!partner) {
          return reply.status(404).send({ success: false, error: 'Partner not found' });
        }
        // fall through to shared enrichment below using `partner`
        const customers = await fastify.prisma.user.findMany({
          where: { referredByPartner: partner.id },
          select: {
            id: true,
            name: true,
            email: true,
            createdAt: true,
            subscription: {
              select: { plan: true, status: true, currentPeriodEnd: true },
            },
          },
          orderBy: { createdAt: 'desc' },
        });

        const prices: Record<string, number> = { starter: 2900, professional: 7900, agency: 19900 };
        const activeCustomers = customers.filter((c: any) => c.subscription?.status === 'active');
        const mrr = activeCustomers.reduce((sum, c: any) => sum + (prices[c.subscription?.plan || ''] || 0), 0);
        const commissionEarned = Math.round(mrr * (partner.commissionRate / 100));

        const commissionHistory = await fastify.prisma.commissionRecord.findMany({
          where: { partnerId: partner.id },
          orderBy: { month: 'desc' },
          take: 12,
        });

        return {
          success: true,
          data: {
            partner,
            stats: {
              totalCustomers: customers.length,
              activeCustomers: activeCustomers.length,
              mrr,
              commissionRate: partner.commissionRate,
              commissionEarned,
              commissionPaid: commissionHistory.filter((c: any) => c.paid).reduce((s, c) => s + c.amount, 0),
            },
            customers,
            commissionHistory,
          },
        };
      }

      const { userId, role } = await (request as any).authenticate();

      const partner = await fastify.prisma.partner.findFirst({
        where: role === 'partner' ? { id, partnerUserId: userId } : { id, userId },
      });

      if (!partner) {
        return { success: false, error: 'Partner not found' };
      }

      // Get customers
      const customers = await fastify.prisma.user.findMany({
        where: { referredByPartner: partner.id },
        select: {
          id: true,
          name: true,
          email: true,
          createdAt: true,
          subscription: {
            select: { plan: true, status: true, currentPeriodEnd: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      // Calculate MRR and commission
      const prices: Record<string, number> = { starter: 2900, professional: 7900, agency: 19900 };
      const activeCustomers = customers.filter((c: any) => c.subscription?.status === 'active');
      const mrr = activeCustomers.reduce((sum, c: any) => sum + (prices[c.subscription?.plan || ''] || 0), 0);
      const commissionEarned = Math.round(mrr * (partner.commissionRate / 100));

      // Commission history (monthly snapshots)
      const commissionHistory = await fastify.prisma.commissionRecord.findMany({
        where: { partnerId: partner.id },
        orderBy: { month: 'desc' },
        take: 12,
      });

      return {
        success: true,
        data: {
          partner,
          stats: {
            totalCustomers: customers.length,
            activeCustomers: activeCustomers.length,
            mrr,
            commissionRate: partner.commissionRate,
            commissionEarned,
            commissionPaid: commissionHistory.filter((c: any) => c.paid).reduce((s, c) => s + c.amount, 0),
          },
          customers,
          commissionHistory,
        },
      };
    },
  );

  // ── Assign Customer to Partner ──
  fastify.post(
    '/:id/assign',
    { preHandler: [fastify.authenticate as any] },
    async (request, reply) => {
      const { userId, role } = await (request as any).authenticate();
      if (role !== 'owner' && role !== 'admin') {
        return reply.status(403).send({ success: false, error: 'Unauthorized' });
      }

      const { id } = request.params as { id: string };
      const schema = z.object({ customerId: z.string() });
      const { customerId } = schema.parse(request.body);

      // Verify partner exists
      const partner = await fastify.prisma.partner.findFirst({ where: { id, userId } });
      if (!partner) {
        return reply.status(404).send({ success: false, error: 'Partner not found' });
      }

      // Update user with referredByPartner
      await fastify.prisma.user.update({
        where: { id: customerId },
        data: { referredByPartner: partner.id },
      });

      captureEvent(userId, Events.PARTNER_CUSTOMER_ASSIGNED, {
        partnerId: partner.id,
        customerId,
      });

      return { success: true, data: { assigned: true, partnerId: partner.id, customerId } };
    },
  );

  // ── Partner Portal (Self-Service Dashboard) — requires partner JWT ──
  fastify.get(
    '/portal',
    { preHandler: [fastify.authenticatePartner as any] },
    async (request) => {
      const auth = await (request as any).authenticatePartner();

      const partner = await fastify.prisma.partner.findFirst({
        where: { id: auth.partnerId, partnerUserId: auth.userId, status: 'active' },
      });

      if (!partner) {
        return { success: false, error: 'Partner account not found. Please contact the admin to set up your account.' };
      }

      const customers = await fastify.prisma.user.findMany({
        where: { referredByPartner: partner.id },
        select: {
          id: true,
          name: true,
          email: true,
          createdAt: true,
          subscription: { select: { plan: true, status: true } },
        },
        orderBy: { createdAt: 'desc' },
      });

      const prices: Record<string, number> = { starter: 2900, professional: 7900, agency: 19900 };
      const activeCustomers = customers.filter((c: any) => c.subscription?.status === 'active');
      const mrr = activeCustomers.reduce((sum, c: any) => sum + (prices[c.subscription?.plan || ''] || 0), 0);
      const commissionEarned = Math.round(mrr * (partner.commissionRate / 100));

      return {
        success: true,
        data: {
          partner: {
            id: partner.id,
            name: partner.name,
            city: partner.city,
            territory: partner.territory,
            commissionRate: partner.commissionRate,
          },
          stats: {
            totalCustomers: customers.length,
            activeCustomers: activeCustomers.length,
            mrr,
            commissionEarned,
          },
          customers,
        },
      };
    },
  );
};

export default partnerRoutes;
