import { FastifyPluginAsync } from 'fastify';

const revenueRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', fastify.authenticate as any);

  // Revenue summary — executive overview
  fastify.get('/summary', async (request) => {
    const { userId } = await (request as any).authenticate();
    const q = request.query as { period?: string };
    const period = q.period || 'monthly';

    const now = new Date();
    let startDate: Date;
    let prevStartDate: Date;
    switch (period) {
      case 'daily':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        prevStartDate = new Date(startDate.getTime() - 24 * 60 * 60 * 1000);
        break;
      case 'weekly':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        prevStartDate = new Date(startDate.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'monthly':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        prevStartDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        break;
      case 'yearly':
        startDate = new Date(now.getFullYear(), 0, 1);
        prevStartDate = new Date(now.getFullYear() - 1, 0, 1);
        break;
      default:
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        prevStartDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    }

    const [
      currentDeals,
      currentLeads,
      currentComments,
      previousDeals,
      previousLeads,
      allDeals,
    ] = await Promise.all([
      fastify.prisma.cRMDeal.findMany({ where: { userId, createdAt: { gte: startDate } } }),
      fastify.prisma.lead.findMany({ where: { userId, createdAt: { gte: startDate } } }),
      fastify.prisma.socialComment.findMany({ where: { userId, createdAt: { gte: startDate } } }),
      fastify.prisma.cRMDeal.findMany({
        where: { userId, createdAt: { gte: prevStartDate, lt: startDate } },
      }),
      fastify.prisma.lead.findMany({
        where: { userId, createdAt: { gte: prevStartDate, lt: startDate } },
      }),
      fastify.prisma.cRMDeal.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        include: { lead: { select: { name: true, socialHandle: true, source: true } } },
      }),
    ]);

    const wonDeals = currentDeals.filter(d => d.stage === 'won');
    const currentRevenue = wonDeals.reduce((sum, d) => sum + (d.revenue || d.value || 0), 0);
    const totalRevenue = allDeals.filter(d => d.stage === 'won').reduce((sum, d) => sum + (d.revenue || d.value || 0), 0);
    const previousWon = previousDeals.filter(d => d.stage === 'won');
    const previousRevenue = previousWon.reduce((sum, d) => sum + (d.revenue || d.value || 0), 0);

    // AI-attributed revenue — deals from leads that originated from AI interactions (comment/dm source)
    const aiDeals = allDeals.filter(d => d.lead?.source === 'comment' || d.lead?.source === 'dm');
    const aiRevenue = aiDeals.filter(d => d.stage === 'won').reduce((sum, d) => sum + (d.revenue || d.value || 0), 0);

    const opportunities = currentDeals.filter(d =>
      ['qualified', 'demo_scheduled', 'proposal_sent', 'negotiation'].includes(d.stage)
    ).length;

    const leadsGenerated = currentLeads.length;
    const dealsWon = wonDeals.length;
    const previousLeadsGenerated = previousLeads.length;
    const previousDealsWon = previousWon.length;

    return {
      success: true,
      data: {
        period,
        totalRevenue: Math.round(totalRevenue),
        currentMonthRevenue: Math.round(currentRevenue),
        previousPeriodRevenue: Math.round(previousRevenue),
        aiAttributedRevenue: Math.round(aiRevenue),
        aiRevenuePercentage: totalRevenue > 0 ? Math.round((aiRevenue / totalRevenue) * 100) : 0,
        dealsWon,
        previousDealsWon,
        opportunitiesCreated: opportunities,
        leadsGenerated,
        previousLeadsGenerated,
        leadToOpportunityRate: leadsGenerated > 0 ? Math.round((opportunities / leadsGenerated) * 100) : 0,
        opportunityToWonRate: opportunities > 0 ? Math.round((dealsWon / opportunities) * 100) : 0,
      },
    };
  });

  // Revenue trend data (for charts)
  fastify.get('/trend', async (request) => {
    const { userId } = await (request as any).authenticate();

    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const deals = await fastify.prisma.cRMDeal.findMany({
      where: { userId, stage: 'won', createdAt: { gte: ninetyDaysAgo } },
      orderBy: { createdAt: 'asc' },
    });

    // Group by month
    const monthlyData: Record<string, { revenue: number; count: number }> = {};
    for (const deal of deals) {
      const month = deal.createdAt.toISOString().slice(0, 7); // YYYY-MM
      if (!monthlyData[month]) monthlyData[month] = { revenue: 0, count: 0 };
      monthlyData[month].revenue += deal.revenue || deal.value || 0;
      monthlyData[month].count += 1;
    }

    return {
      success: true,
      data: Object.entries(monthlyData)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, data]) => ({ month, ...data })),
    };
  });

  // Conversion funnel
  fastify.get('/funnel', async (request) => {
    const { userId } = await (request as any).authenticate();

    const [allLeads, allOpps, allWon] = await Promise.all([
      fastify.prisma.lead.count({ where: { userId } }),
      fastify.prisma.cRMDeal.count({
        where: { userId, stage: { in: ['qualified', 'demo_scheduled', 'proposal_sent', 'negotiation'] } },
      }),
      fastify.prisma.cRMDeal.count({ where: { userId, stage: 'won' } }),
    ]);

    // Also get lost deals
    const lost = await fastify.prisma.cRMDeal.count({ where: { userId, stage: 'lost' } });

    const totalProcessed = allOpps + allWon + lost;

    return {
      success: true,
      data: {
        leads: allLeads,
        opportunities: allOpps,
        won: allWon,
        lost,
        leadToOpportunity: allLeads > 0 ? Math.round((allOpps / allLeads) * 100) : 0,
        opportunityToWon: allOpps > 0 ? Math.round((allWon / allOpps) * 100) : 0,
        opportunityToLost: allOpps > 0 ? Math.round((lost / allOpps) * 100) : 0,
      },
    };
  });

  // Executive summary text
  fastify.get('/executive-summary', async (request) => {
    const { userId } = await (request as any).authenticate();
    const q = request.query as { period?: string };
    const period = q.period || 'monthly';

    const now = new Date();
    let startDate: Date;
    switch (period) {
      case 'daily': startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000); break;
      case 'weekly': startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); break;
      case 'monthly': startDate = new Date(now.getFullYear(), now.getMonth(), 1); break;
      case 'yearly': startDate = new Date(now.getFullYear(), 0, 1); break;
      default: startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    const [leads, deals, comments, conversations] = await Promise.all([
      fastify.prisma.lead.findMany({ where: { userId, createdAt: { gte: startDate } } }),
      fastify.prisma.cRMDeal.findMany({
        where: { userId, createdAt: { gte: startDate } },
        include: { lead: { select: { source: true } } },
      }),
      fastify.prisma.socialComment.findMany({ where: { userId, createdAt: { gte: startDate } } }),
      fastify.prisma.dMConversation.findMany({ where: { userId, createdAt: { gte: startDate } } }),
    ]);

    const wonDeals = deals.filter(d => d.stage === 'won');
    const totalRevenue = wonDeals.reduce((sum, d) => sum + (d.revenue || d.value || 0), 0);
    const aiDeals = deals.filter(d => d.lead?.source === 'comment' || d.lead?.source === 'dm');
    const aiRevenue = aiDeals.filter(d => d.stage === 'won').reduce((sum, d) => sum + (d.revenue || d.value || 0), 0);
    const opportunities = deals.filter(d =>
      ['qualified', 'demo_scheduled', 'proposal_sent', 'negotiation'].includes(d.stage)
    ).length;

    const totalLeads = leads.length;
    const hotLeads = leads.filter(l => l.category === 'hot' || l.category === 'vip').length;
    const interactions = comments.length + conversations.length;

    // Generate natural language summary
    let summary = '';
    if (totalLeads > 0) {
      summary = `AI generated ${totalLeads} lead${totalLeads > 1 ? 's' : ''}`;
      if (opportunities > 0) summary += `, ${opportunities} opportunit${opportunities > 1 ? 'ies' : 'y'}`;
      if (totalRevenue > 0) summary += ` and ${formatCurrency(totalRevenue)} in attributed revenue`;
      summary += ` this ${period} period. `;

      if (hotLeads > 0) {
        summary += `${hotLeads} hot lead${hotLeads > 1 ? 's are' : ' is'} ready for follow-up. `;
      }
      if (aiRevenue > 0) {
        summary += `AI-influenced revenue accounts for ${Math.round((aiRevenue / totalRevenue) * 100)}% of total revenue. `;
      }
    } else {
      summary = `No leads generated yet this ${period} period. Connect your social accounts and AI will start generating leads automatically. `;
    }

    if (interactions > 0) {
      summary += `${interactions} customer interaction${interactions > 1 ? 's were' : ' was'} handled during this time.`;
    }

    return {
      success: true,
      data: {
        summary,
        period,
        metrics: {
          leadsGenerated: totalLeads,
          hotLeads,
          opportunitiesCreated: opportunities,
          dealsWon: wonDeals.length,
          totalRevenue: Math.round(totalRevenue),
          aiAttributedRevenue: Math.round(aiRevenue),
          aiRevenuePercentage: totalRevenue > 0 ? Math.round((aiRevenue / totalRevenue) * 100) : 0,
          interactions,
        },
      },
    };
  });
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

export default revenueRoutes;
