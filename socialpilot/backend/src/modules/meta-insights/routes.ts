/**
 * MetaPilot AI — Meta Insights Routes
 *
 * Provides endpoints for Meta Business insights including follower growth,
 * engagement metrics, and content performance.
 *
 * Endpoints:
 * - GET  /api/meta-insights/followers    — Follower growth data (dashboard widget)
 * - POST /api/meta-insights/followers/snapshot  — Record a daily follower snapshot
 */

import { FastifyPluginAsync } from 'fastify';
import { FollowerGrowthService } from '../../services/meta/follower-growth';

const metaInsightsRoutes: FastifyPluginAsync = async (fastify) => {
  const growthService = new FollowerGrowthService(fastify.prisma as any);

  // ── Follower Growth Dashboard Data ──
  fastify.get(
    '/followers',
    { preHandler: [fastify.authenticate as any] },
    async (request) => {
      const { userId } = await (request as any).authenticate();
      const q = request.query as { days?: string };

      const days = parseInt(q.days || '30');
      const data = await growthService.getGrowthData(userId, days);

      // Get current connections for display
      const connections = await fastify.prisma.metaConnection.findMany({
        where: { userId, status: 'active' },
        select: {
          instagramAccountId: true,
          instagramUsername: true,
          facebookPageId: true,
          facebookPageName: true,
        },
      });

      return {
        success: true,
        data: {
          ...data,
          connections: connections.map(c => ({
            platform: c.instagramAccountId ? 'instagram' : 'facebook',
            displayName: c.instagramUsername || c.facebookPageName || 'Connected',
          })),
          days,
        },
      };
    },
  );

  // ── Record Daily Snapshot ──
  fastify.post(
    '/followers/snapshot',
    { preHandler: [fastify.authenticate as any] },
    async (request) => {
      const { userId } = await (request as any).authenticate();

      const result = await growthService.recordDailySnapshot(userId);

      return {
        success: true,
        data: {
          recorded: result.snapshots.length,
          snapshots: result.snapshots,
          message: result.snapshots.length > 0
            ? `Recorded snapshots for ${result.snapshots.map(s => s.platform).join(', ')}`
            : 'No active connections found. Connect Instagram or Facebook first.',
        },
      };
    },
  );

  // ── Follower Growth History (for charts) ──
  fastify.get(
    '/followers/history',
    { preHandler: [fastify.authenticate as any] },
    async (request) => {
      const { userId } = await (request as any).authenticate();
      const q = request.query as { days?: string };

      const days = parseInt(q.days || '90');
      const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const snapshots = await fastify.prisma.followerSnapshot.findMany({
        where: { userId, snapshotDate: { gte: startDate } },
        orderBy: { snapshotDate: 'asc' },
        select: {
          platform: true,
          followers: true,
          follows: true,
          snapshotDate: true,
        },
      });

      // Group by platform for chart series
      const byPlatform: Record<string, Array<{ date: string; followers: number }>> = {};
      for (const s of snapshots) {
        if (!byPlatform[s.platform]) byPlatform[s.platform] = [];
        byPlatform[s.platform].push({
          date: s.snapshotDate.toISOString().slice(0, 10),
          followers: s.followers,
        });
      }

      return {
        success: true,
        data: {
          series: Object.entries(byPlatform).map(([platform, data]) => ({
            platform,
            data,
          })),
          days,
        },
      };
    },
  );
};

export default metaInsightsRoutes;
