import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { isSentryEnabled } from '../../services/sentry/sentry';
import { isPostHogEnabled } from '../../services/analytics/posthog';
import { config } from '../../config';

const adminRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', fastify.authenticate as any);

  // ── Usage Statistics ──

  /** Aggregate usage stats across all users (owner/admin only) */
  fastify.get('/stats', async (request, reply) => {
    const { userId } = await (request as any).authenticate();

    // Verify caller is owner or admin
    const caller = await fastify.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (!caller || (caller.role !== 'owner' && caller.role !== 'admin')) {
      return reply.status(403).send({ success: false, error: 'Forbidden — admin access required' });
    }

    const [
      totalUsers,
      totalConnections,
      totalLeads,
      totalDeals,
      totalComments,
      totalConversations,
      totalEscalations,
      recentActivity,
    ] = await Promise.all([
      fastify.prisma.user.count(),
      fastify.prisma.metaConnection.count({ where: { status: 'active' } }),
      fastify.prisma.lead.count(),
      fastify.prisma.cRMDeal.count(),
      fastify.prisma.socialComment.count(),
      fastify.prisma.dMConversation.count(),
      fastify.prisma.escalationTicket.count({ where: { status: 'open' } }),
      fastify.prisma.auditLogEntry.findMany({
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: { user: { select: { name: true, email: true } } },
      }),
    ]);

    return {
      success: true,
      data: {
        users: { total: totalUsers },
        connections: { total: totalConnections },
        leads: { total: totalLeads },
        deals: { total: totalDeals },
        comments: { total: totalComments },
        conversations: { total: totalConversations },
        escalations: { total: totalEscalations },
        recentActivity,
      },
    };
  });

  // ── Audit Log ──

  /** List audit log entries with pagination and filtering */
  fastify.get('/audit-log', async (request, reply) => {
    const { userId } = await (request as any).authenticate();

    const caller = await fastify.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (!caller || (caller.role !== 'owner' && caller.role !== 'admin')) {
      return reply.status(403).send({ success: false, error: 'Forbidden — admin access required' });
    }

    const q = request.query as {
      page?: string;
      limit?: string;
      action?: string;
      userId?: string;
    };
    const page = parseInt(q.page || '1');
    const limit = parseInt(q.limit || '50');

    const where: any = {};
    if (q.action) where.action = q.action;
    if (q.userId) where.userId = q.userId;

    const [data, total] = await Promise.all([
      fastify.prisma.auditLogEntry.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          user: { select: { name: true, email: true } },
        },
      }),
      fastify.prisma.auditLogEntry.count({ where }),
    ]);

    return {
      success: true,
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  });

  /** Create an audit log entry (internal helper exposed for cross-module use) */
  fastify.post('/audit-log', async (request) => {
    const { userId } = await (request as any).authenticate();
    const schema = z.object({
      action: z.string().min(1),
      resourceType: z.string().min(1),
      resourceId: z.string().optional(),
      details: z.record(z.unknown()).optional(),
    });
    const body = schema.parse(request.body);

    const entry = await fastify.prisma.auditLogEntry.create({
      data: {
        userId,
        actorId: userId,
        action: body.action,
        resourceType: body.resourceType,
        resourceId: body.resourceId,
        details: (body.details ?? undefined) as any,
      },
    });

    return { success: true, data: entry };
  });

  // ── System Health ──

  /** System health dashboard — queue status, error counts, service health */
  fastify.get('/health', async (request, reply) => {
    const { userId } = await (request as any).authenticate();

    const caller = await fastify.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (!caller || (caller.role !== 'owner' && caller.role !== 'admin')) {
      return reply.status(403).send({ success: false, error: 'Forbidden — admin access required' });
    }

    // Gather system metrics
    const [
      totalUsers,
      activeConnections,
      openEscalations,
      totalCriticalErrors,
      pendingComments,
      pendingDMs,
      totalLeads,
      recentErrors,
    ] = await Promise.all([
      fastify.prisma.user.count(),
      fastify.prisma.metaConnection.count({ where: { status: 'active' } }),
      fastify.prisma.escalationTicket.count({ where: { status: 'open' } }),
      fastify.prisma.escalationTicket.count({ where: { severity: 'critical', status: 'open' } }),
      fastify.prisma.socialComment.count({ where: { replyStatus: 'pending' } }),
      fastify.prisma.dMConversation.count({ where: { status: 'active' } }),
      fastify.prisma.lead.count(),
      fastify.prisma.escalationTicket.findMany({
        where: { severity: 'critical' },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { id: true, reason: true, context: true, customerId: true, createdAt: true },
      }),
    ]);

    return {
      success: true,
      data: {
        services: {
          api: { status: 'healthy', uptime: process.uptime() },
          database: { status: 'connected' },
          queue: { status: 'active', pendingComments, pendingDMs },
        },
        metrics: {
          totalUsers,
          activeConnections,
          totalLeads,
          openEscalations,
          pendingAiResponses: pendingComments + pendingDMs,
        },
        errors: {
          criticalCount: totalCriticalErrors,
          recentErrors,
        },
        sentry: {
          enabled: isSentryEnabled(),
          dsnConfigured: !!(config.sentry.dsn),
        },
        posthog: {
          enabled: isPostHogEnabled(),
          apiKeyConfigured: !!(config.posthog.apiKey),
        },
      },
    };
  });

  // ── Users Management ──

  /** List all users (admin only) */
  fastify.get('/users', async (request, reply) => {
    const { userId } = await (request as any).authenticate();

    const caller = await fastify.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (!caller || (caller.role !== 'owner' && caller.role !== 'admin')) {
      return reply.status(403).send({ success: false, error: 'Forbidden — admin access required' });
    }

    const q = request.query as { page?: string; limit?: string };
    const page = parseInt(q.page || '1');
    const limit = parseInt(q.limit || '20');

    const [data, total] = await Promise.all([
      fastify.prisma.user.findMany({
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          onboardingDone: true,
          createdAt: true,
          _count: {
            select: {
              leads: true,
              crmDeals: true,
              metaConnections: true,
            },
          },
        },
      }),
      fastify.prisma.user.count(),
    ]);

    return { success: true, data, total, page, limit, totalPages: Math.ceil(total / limit) };
  });
};

export default adminRoutes;
