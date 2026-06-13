import { FastifyPluginAsync } from 'fastify';

const analyticsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', fastify.authenticate as any);

  // Dashboard overview
  fastify.get('/overview', async (request) => {
    const { userId } = await (request as any).authenticate();
    const q = request.query as { period?: string };
    const period = q.period || 'weekly';
    
    const now = new Date();
    let startDate: Date;
    switch (period) {
      case 'daily': startDate = new Date(now.setDate(now.getDate() - 1)); break;
      case 'weekly': startDate = new Date(now.setDate(now.getDate() - 7)); break;
      case 'monthly': startDate = new Date(now.setMonth(now.getMonth() - 1)); break;
      case 'yearly': startDate = new Date(now.setFullYear(now.getFullYear() - 1)); break;
      default: startDate = new Date(now.setDate(now.getDate() - 7));
    }
    
    const [
      comments, dms, leads, escalations, deals,
      connections, documents, ctas,
    ] = await Promise.all([
      fastify.prisma.socialComment.findMany({ where: { userId, createdAt: { gte: startDate } } }),
      fastify.prisma.dMConversation.findMany({ where: { userId, createdAt: { gte: startDate } } }),
      fastify.prisma.lead.findMany({ where: { userId, createdAt: { gte: startDate } } }),
      fastify.prisma.escalationTicket.findMany({ where: { userId, createdAt: { gte: startDate } } }),
      fastify.prisma.cRMDeal.findMany({ where: { userId, updatedAt: { gte: startDate } } }),
      fastify.prisma.metaConnection.findMany({ where: { userId } }),
      fastify.prisma.knowledgeDocument.findMany({ where: { userId } }),
      fastify.prisma.cTAConfig.findMany({ where: { userId } }),
    ]);
    
    const commentsReplied = comments.filter(c => c.replyStatus === 'replied').length;
    const dmsReplied = dms.filter(d => d.status === 'resolved').length;
    const hotLeads = leads.filter(l => l.category === 'hot' || l.category === 'vip').length;
    const won = deals.filter(d => d.stage === 'won').length;
    
    return {
      success: true,
      data: {
        period,
        comments: { total: comments.length, replied: commentsReplied, rate: comments.length ? Math.round(commentsReplied / comments.length * 100) : 0 },
        dms: { total: dms.length, replied: dmsReplied, rate: dms.length ? Math.round(dmsReplied / dms.length * 100) : 0 },
        leads: { total: leads.length, hot: hotLeads },
        escalations: { total: escalations.length },
        deals: { total: deals.length, won },
        estimatedRevenue: deals.filter(d => d.stage === 'won').reduce((sum, d) => sum + (d.value || 0), 0),
        // Aggregate counts used by funnels page
        totalUsers: 1,
        totalConnections: connections.length,
        totalDocuments: documents.length,
        totalCtas: ctas.length,
        totalLeads: leads.length,
        totalDeals: deals.length,
      },
    };
  });

  // Lead metrics
  fastify.get('/leads', async (request) => {
    const { userId } = await (request as any).authenticate();
    const leads = await fastify.prisma.lead.findMany({ where: { userId } });
    
    return {
      success: true,
      data: {
        total: leads.length,
        cold: leads.filter(l => l.category === 'cold').length,
        warm: leads.filter(l => l.category === 'warm').length,
        hot: leads.filter(l => l.category === 'hot').length,
        vip: leads.filter(l => l.category === 'vip').length,
        avgScore: leads.length ? Math.round(leads.reduce((s, l) => s + l.leadScore, 0) / leads.length) : 0,
        bySource: {
          comment: leads.filter(l => l.source === 'comment').length,
          dm: leads.filter(l => l.source === 'dm').length,
          manual: leads.filter(l => l.source === 'manual').length,
        },
      },
    };
  });

  // Growth metrics
  fastify.get('/growth', async (request) => {
    const { userId } = await (request as any).authenticate();
    
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    const leadsByDay = await fastify.prisma.lead.findMany({
      where: { userId, createdAt: { gte: thirtyDaysAgo } },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    });
    
    const dailyCounts: Record<string, number> = {};
    for (const lead of leadsByDay) {
      const day = lead.createdAt.toISOString().slice(0, 10);
      dailyCounts[day] = (dailyCounts[day] || 0) + 1;
    }
    
    return {
      success: true,
      data: {
        dailyLeads: Object.entries(dailyCounts).map(([date, count]) => ({ date, count })),
      },
    };
  });

  // ── AI Insights Engine ──

  /** Get stored insights for a given period */
  fastify.get('/insights', async (request) => {
    const { userId } = await (request as any).authenticate();
    const q = request.query as { period?: string };
    const period = q.period || 'weekly';

    const insights = await fastify.prisma.insight.findMany({
      where: { userId, period },
      orderBy: { createdAt: 'desc' },
      take: 12,
    });

    // Group by generation timestamp to reconstruct reports
    const groups = insights.reduce<Record<string, any>>((acc, i) => {
      const key = i.createdAt.toISOString();
      if (!acc[key]) {
        acc[key] = {
          summary: `Analysis of your ${period} customer interactions across all channels.`,
          recommendations: [
            'Review top customer questions and add them to your FAQ',
            'Follow up with hot leads within 24 hours',
            'Update your CTA strategy based on what\'s working best',
          ],
          insights: [],
        };
      }
      acc[key].insights.push({
        id: i.id,
        category: i.category,
        title: i.title,
        description: i.description,
        value: i.value,
        trend: i.trend,
        period: i.period,
        generatedAt: i.createdAt.toISOString(),
      });
      return acc;
    }, {});

    const timestamps = Object.keys(groups).sort().reverse();
    const latest = timestamps.length > 0 ? groups[timestamps[0]] : null;

    if (!latest) {
      return {
        success: true,
        data: {
          summary: `No insights available yet for this ${period} period. Generate insights to see intelligence from your conversations.`,
          recommendations: ['Generate insights to get started'],
          insights: [],
        },
      };
    }

    return { success: true, data: latest };
  });

  /** Generate fresh AI insights from conversation data */
  fastify.post('/insights/generate', async (request) => {
    const { userId } = await (request as any).authenticate();
    const body = request.body as { period?: string };
    const period = body.period || 'weekly';

    // Gather data for insight generation
    const now = new Date();
    let startDate: Date;
    switch (period) {
      case 'daily': startDate = new Date(now.setDate(now.getDate() - 1)); break;
      case 'weekly': startDate = new Date(now.setDate(now.getDate() - 7)); break;
      case 'monthly': startDate = new Date(now.setMonth(now.getMonth() - 1)); break;
      case 'yearly': startDate = new Date(now.setFullYear(now.getFullYear() - 1)); break;
      default: startDate = new Date(now.setDate(now.getDate() - 7));
    }

    const [comments, conversations, leads] = await Promise.all([
      fastify.prisma.socialComment.findMany({ where: { userId, createdAt: { gte: startDate } } }),
      fastify.prisma.dMConversation.findMany({ where: { userId, createdAt: { gte: startDate } } }),
      fastify.prisma.lead.findMany({ where: { userId, createdAt: { gte: startDate } } }),
    ]);

    // Generate insights from data
    const insights: Array<{
      category: string;
      title: string;
      description: string;
      value: number;
      trend: 'up' | 'down' | 'stable';
    }> = [];

    // Common questions insight
    const questionCount = comments.length + conversations.length;
    insights.push({
      category: 'common_questions',
      title: `Total Interactions`,
      description: `Customer conversations handled during this ${period} period.`,
      value: questionCount,
      trend: questionCount > 10 ? 'up' : questionCount > 0 ? 'stable' : 'down',
    });

    // Lead generation insight
    const leadCount = leads.length;
    const hotLeadCount = leads.filter(l => l.category === 'hot' || l.category === 'vip').length;
    insights.push({
      category: 'requested_products',
      title: `Leads Generated`,
      description: `${hotLeadCount} hot leads out of ${leadCount} total — ${leadCount > 0 ? Math.round(hotLeadCount / leadCount * 100) : 0}% conversion rate.`,
      value: leadCount,
      trend: leadCount > 5 ? 'up' : leadCount > 0 ? 'stable' : 'down',
    });

    // Sentiment insight
    const sentimentValues = comments
      .filter(c => c.sentiment !== null)
      .map(c => c.sentiment as number);
    const avgSentiment = sentimentValues.length > 0
      ? sentimentValues.reduce((a, b) => a + b, 0) / sentimentValues.length
      : 0;
    insights.push({
      category: 'sentiment_trend',
      title: `Average Sentiment`,
      description: `Customer sentiment across all interactions. ${avgSentiment > 0.3 ? 'Mostly positive' : avgSentiment < -0.3 ? 'Needs attention' : 'Neutral'} (${(avgSentiment * 100).toFixed(0)}%)`,
      value: Math.round(avgSentiment * 100),
      trend: avgSentiment > 0.3 ? 'up' : avgSentiment < -0.3 ? 'down' : 'stable',
    });

    // Response rate insight
    const repliedComments = comments.filter(c => c.replyStatus === 'replied').length;
    const replyRate = comments.length > 0 ? Math.round(repliedComments / comments.length * 100) : 0;
    insights.push({
      category: 'response_quality',
      title: `AI Reply Rate`,
      description: `Your AI responded to ${repliedComments} out of ${comments.length} comments (${replyRate}% rate).`,
      value: replyRate,
      trend: replyRate >= 80 ? 'up' : replyRate >= 50 ? 'stable' : 'down',
    });

    // Delete old insights for this period
    await fastify.prisma.insight.deleteMany({ where: { userId, period } });

    // Store new insights
    const created = await Promise.all(
      insights.map(i =>
        fastify.prisma.insight.create({
          data: {
            userId,
            category: i.category,
            title: i.title,
            description: i.description,
            value: i.value,
            trend: i.trend,
            period,
          },
        })
      )
    );

    const summary = `Analysis of your ${period} interactions: ${leadCount} leads generated from ${questionCount} conversations with ${replyRate}% AI response rate. ${avgSentiment > 0.3 ? 'Customer sentiment is positive.' : avgSentiment < -0.3 ? 'Customer sentiment needs attention.' : 'Customer sentiment is neutral.'}`;

    const recommendations = [];
    if (replyRate < 80) {
      recommendations.push('Improve response rate by reviewing unanswered comments');
    }
    if (hotLeadCount > 0) {
      recommendations.push(`Follow up with ${hotLeadCount} hot leads within 24 hours`);
    }
    if (avgSentiment < 0) {
      recommendations.push('Review negative sentiment conversations for improvement areas');
    }
    if (insights.length > 0) {
      recommendations.push('Keep your FAQ knowledge base up to date with common questions');
    }

    return {
      success: true,
      data: {
        summary,
        recommendations,
        insights: created.map(i => ({
          id: i.id,
          category: i.category,
          title: i.title,
          description: i.description,
          value: i.value,
          trend: i.trend,
          period: i.period,
          generatedAt: i.createdAt.toISOString(),
        })),
      },
    };
  });
};

export default analyticsRoutes;
