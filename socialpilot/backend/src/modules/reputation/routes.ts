import { FastifyPluginAsync } from 'fastify';

const reputationRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', fastify.authenticate as any);

  // Reputation overview dashboard
  fastify.get('/overview', async (request) => {
    const { userId } = await (request as any).authenticate();

    // Get sentiment data from comments
    const comments = await fastify.prisma.socialComment.findMany({
      where: { userId },
      select: { sentiment: true, category: true, id: true, content: true, authorName: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });

    // Get escalation tickets
    const escalations = await fastify.prisma.escalationTicket.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    // Get active crises (reputation alerts)
    const activeAlerts = escalations.filter(e => e.reputationAlert === true && e.status === 'open');

    const totalWithSentiment = comments.filter(c => c.sentiment !== null);
    const positive = totalWithSentiment.filter(c => (c.sentiment as number) > 0.3).length;
    const neutral = totalWithSentiment.filter(c => (c.sentiment as number) >= -0.3 && (c.sentiment as number) <= 0.3).length;
    const negative = totalWithSentiment.filter(c => (c.sentiment as number) < -0.3).length;
    const crisis = escalations.filter(e => e.severity === 'critical').length;

    const total = totalWithSentiment.length || 1;
    const positivePercent = Math.round((positive / total) * 100);
    const negativePercent = Math.round((negative / total) * 100);
    const reputationScore = Math.max(0, Math.min(100, 50 + (positivePercent - negativePercent) * 0.5));

    // Calculate trend (compare last 7 days vs previous 7)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recentComments = comments.filter(c => c.createdAt >= sevenDaysAgo);
    const recentPos = recentComments.filter(c => c.sentiment !== null && (c.sentiment as number) > 0.3).length;
    const recentNeg = recentComments.filter(c => c.sentiment !== null && (c.sentiment as number) < -0.3).length;
    const recentTotal = recentComments.filter(c => c.sentiment !== null).length || 1;
    const recentScore = 50 + ((recentPos / recentTotal) - (recentNeg / recentTotal)) * 50;

    return {
      success: true,
      data: {
        reputationScore: Math.round(reputationScore),
        trend: Math.round(recentScore - reputationScore),
        positivePercent,
        negativePercent,
        neutralPercent: Math.round((neutral / total) * 100),
        totalInteractions: totalWithSentiment.length,
        positive,
        neutral,
        negative,
        crisis,
        openEscalations: escalations.filter(e => e.status === 'open').length,
        activeAlerts: activeAlerts.length,
        recentAlerts: activeAlerts.slice(0, 10).map(a => ({
          id: a.id,
          reason: a.reason,
          context: a.context,
          severity: a.severity,
          createdAt: a.createdAt.toISOString(),
        })),
      },
    };
  });

  // Sentiment trend data (for charts)
  fastify.get('/sentiment-trend', async (request) => {
    const { userId } = await (request as any).authenticate();

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const comments = await fastify.prisma.socialComment.findMany({
      where: {
        userId,
        sentiment: { not: null },
        createdAt: { gte: thirtyDaysAgo },
      },
      orderBy: { createdAt: 'asc' },
      select: { sentiment: true, createdAt: true },
    });

    // Group by day
    const dailySentiment: Record<string, { total: number; count: number }> = {};
    for (const c of comments) {
      const day = c.createdAt.toISOString().slice(0, 10);
      if (!dailySentiment[day]) dailySentiment[day] = { total: 0, count: 0 };
      dailySentiment[day].total += c.sentiment as number;
      dailySentiment[day].count += 1;
    }

    return {
      success: true,
      data: Object.entries(dailySentiment)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, data]) => ({
          date,
          avgSentiment: Math.round((data.total / data.count) * 100) / 100,
          count: data.count,
        })),
    };
  });

  // Recent alerts / escalations for reputation
  fastify.get('/alerts', async (request) => {
    const { userId } = await (request as any).authenticate();
    const q = request.query as { status?: string };

    const where: any = { userId };
    if (q.status) where.status = q.status;

    const alerts = await fastify.prisma.escalationTicket.findMany({
      where,
      orderBy: [{ severity: 'asc' }, { createdAt: 'desc' }],
      take: 50,
    });

    return { success: true, data: alerts };
  });
};

export default reputationRoutes;
