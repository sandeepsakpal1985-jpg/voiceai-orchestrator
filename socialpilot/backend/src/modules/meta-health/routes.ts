/**
 * MetaPilot AI — Meta Health Monitoring Module
 *
 * Provides endpoints to monitor the health of Meta connections:
 * - Connection status (active/expired/error)
 * - Token expiry (days remaining)
 * - Webhook delivery health (success/error rates)
 * - Recent processing errors
 *
 * GET /api/meta-health/overview — Health summary
 * POST /api/meta-health/check — Proactive health check against Meta API
 */

import { FastifyPluginAsync } from 'fastify';

const META_GRAPH_URL = 'https://graph.facebook.com/v21.0';

interface ConnectionHealth {
  id: string;
  platform: 'instagram' | 'facebook';
  pageName: string | null;
  instagramUsername: string | null;
  status: string;
  tokenExpiresAt: string;
  tokenDaysRemaining: number;
  tokenExpired: boolean;
  tokenExpiringSoon: boolean;
}

interface WebhookHealth {
  total: number;
  last24h: number;
  last7d: number;
  successRate: number;
  errorRate: number;
  lastReceivedAt: string | null;
  active: boolean;
}

interface ErrorSummary {
  count: number;
  lastError: string | null;
  lastErrorAt: string | null;
  recentErrors: Array<{ message: string; time: string }>;
}

const metaHealthRoutes: FastifyPluginAsync = async (fastify) => {
  // ── Health Overview ──
  fastify.get(
    '/overview',
    { preHandler: [fastify.authenticate as any] },
    async (request) => {
      const { userId } = await (request as any).authenticate();

      // 1. Connection health
      const connections = await fastify.prisma.metaConnection.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      });

      const connectionHealth: ConnectionHealth[] = connections.map((conn: any) => {
        const expiresAt = new Date(conn.tokenExpiresAt).getTime();
        const now = Date.now();
        const daysRemaining = Math.max(0, Math.floor((expiresAt - now) / (1000 * 60 * 60 * 24)));
        return {
          id: conn.id,
          platform: conn.instagramAccountId ? 'instagram' : 'facebook',
          pageName: conn.facebookPageName,
          instagramUsername: conn.instagramUsername,
          status: conn.status,
          tokenExpiresAt: conn.tokenExpiresAt?.toISOString(),
          tokenDaysRemaining: daysRemaining,
          tokenExpired: expiresAt <= now,
          tokenExpiringSoon: daysRemaining > 0 && daysRemaining <= 7,
        };
      });

      // 2. Webhook delivery health
      const webhookCount = await fastify.prisma.metaWebhook.count({
        where: { userId },
      });

      const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const last7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      const webhooks24h = await fastify.prisma.metaWebhook.count({
        where: { userId, createdAt: { gte: last24h } },
      });

      const webhooks7d = await fastify.prisma.metaWebhook.count({
        where: { userId, createdAt: { gte: last7d } },
      });

      const webhooksWithErrors = await fastify.prisma.metaWebhook.count({
        where: { userId, error: { not: null } },
      });

      const lastWebhook = await fastify.prisma.metaWebhook.findFirst({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      });

      const webhookHealth: WebhookHealth = {
        total: webhookCount,
        last24h: webhooks24h,
        last7d: webhooks7d,
        successRate: webhookCount > 0 ? Math.round(((webhookCount - webhooksWithErrors) / webhookCount) * 100) : 100,
        errorRate: webhookCount > 0 ? Math.round((webhooksWithErrors / webhookCount) * 100) : 0,
        lastReceivedAt: lastWebhook?.createdAt?.toISOString() || null,
        active: webhookCount > 0,
      };

      // 3. Recent errors (last 10 webhook processing errors)
      const recentErrors = await fastify.prisma.metaWebhook.findMany({
        where: { userId, error: { not: null } },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { error: true, createdAt: true },
      });

      const errorSummary: ErrorSummary = {
        count: webhooksWithErrors,
        lastError: recentErrors[0]?.error || null,
        lastErrorAt: recentErrors[0]?.createdAt?.toISOString() || null,
        recentErrors: recentErrors.map((e: any) => ({
          message: e.error,
          time: e.createdAt?.toISOString(),
        })),
      };

      // 4. Overall health score (simple heuristic)
      const hasConnection = connections.length > 0;
      const hasActiveConnection = connections.some((c: any) => c.status === 'active');
      const hasTokenExpiring = connectionHealth.some((c) => c.tokenExpiringSoon);
      const hasExpired = connectionHealth.some((c) => c.tokenExpired);
      const errorPercentage = webhookHealth.errorRate;

      let overallScore = 100;
      if (!hasConnection) overallScore -= 40;
      if (!hasActiveConnection) overallScore -= 20;
      if (hasExpired) overallScore -= 30;
      if (hasTokenExpiring) overallScore -= 15;
      if (errorPercentage > 20) overallScore -= Math.min(errorPercentage, 30);
      overallScore = Math.max(0, overallScore);

      // 5. Alerts
      const alerts: Array<{ severity: 'critical' | 'warning' | 'info'; message: string }> = [];
      if (!hasConnection) {
        alerts.push({ severity: 'critical', message: 'No Meta connections configured. Connect Instagram or Facebook to start.' });
      } else if (!hasActiveConnection) {
        alerts.push({ severity: 'critical', message: 'All Meta connections are inactive. Reconnect your accounts.' });
      }
      if (hasExpired) {
        alerts.push({ severity: 'critical', message: 'One or more access tokens have expired. Reconnect affected accounts.' });
      }
      if (hasTokenExpiring) {
        alerts.push({ severity: 'warning', message: 'One or more access tokens will expire within 7 days. Refresh them soon.' });
      }
      if (errorPercentage > 10) {
        alerts.push({ severity: 'warning', message: `Webhook processing error rate is ${errorPercentage}%. Check recent errors.` });
      }
      if (webhookCount === 0 && hasConnection) {
        alerts.push({ severity: 'info', message: 'No webhooks received yet. Ensure your Meta webhook is properly configured.' });
      }

      return {
        success: true,
        data: {
          overallScore,
          alerts,
          connections: connectionHealth,
          webhooks: webhookHealth,
          errors: errorSummary,
          lastChecked: new Date().toISOString(),
        },
      };
    },
  );

  // ── Proactive Health Check ──
  fastify.post(
    '/check',
    { preHandler: [fastify.authenticate as any] },
    async (request, reply) => {
      const { userId } = await (request as any).authenticate();

      const connections = await fastify.prisma.metaConnection.findMany({
        where: { userId, status: 'active' },
      });

      if (connections.length === 0) {
        return reply.status(400).send({
          success: false,
          error: 'No active Meta connections to check.',
        });
      }

      const results: Array<{
        id: string;
        platform: string;
        pageName: string | null;
        reachable: boolean;
        statusCode: number | null;
        error: string | null;
      }> = [];

      for (const conn of connections) {
        try {
          // Ping Meta Graph API to verify token is still valid
          const params = new URLSearchParams({
            access_token: conn.accessToken,
            fields: 'id,name',
          });

          const res = await fetch(`${META_GRAPH_URL}/me?${params.toString()}`, {
            signal: AbortSignal.timeout(10000),
          });

          if (res.ok) {
            results.push({
              id: conn.id,
              platform: conn.instagramAccountId ? 'instagram' : 'facebook',
              pageName: conn.facebookPageName,
              reachable: true,
              statusCode: res.status,
              error: null,
            });
          } else {
            const errBody = await res.json().catch(() => ({}));
            results.push({
              id: conn.id,
              platform: conn.instagramAccountId ? 'instagram' : 'facebook',
              pageName: conn.facebookPageName,
              reachable: false,
              statusCode: res.status,
              error: errBody?.error?.message || `HTTP ${res.status}`,
            });

            // If token is invalid, mark connection as inactive
            if (res.status === 401 || res.status === 403) {
              await fastify.prisma.metaConnection.update({
                where: { id: conn.id },
                data: { status: 'error' },
              });
            }
          }
        } catch (err: any) {
          results.push({
            id: conn.id,
            platform: conn.instagramAccountId ? 'instagram' : 'facebook',
            pageName: conn.facebookPageName,
            reachable: false,
            statusCode: null,
            error: err?.message || 'Connection timeout',
          });
        }
      }

      // Update lastChecked
      const allOk = results.every((r) => r.reachable);

      return {
        success: true,
        data: {
          checked: results.length,
          allOk,
          results,
          checkedAt: new Date().toISOString(),
        },
      };
    },
  );

  // ── Connection History (token refresh history) ──
  fastify.get(
    '/history',
    { preHandler: [fastify.authenticate as any] },
    async (request) => {
      const { userId } = await (request as any).authenticate();

      const connections = await fastify.prisma.metaConnection.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          facebookPageName: true,
          instagramUsername: true,
          status: true,
          tokenExpiresAt: true,
          connectedAt: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: { webhooks: true },
          },
        },
      });

      return {
        success: true,
        data: connections,
      };
    },
  );
};

export default metaHealthRoutes;
