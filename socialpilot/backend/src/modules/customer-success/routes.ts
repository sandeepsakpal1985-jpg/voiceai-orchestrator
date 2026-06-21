import { FastifyPluginAsync } from 'fastify';

const customerSuccessRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', fastify.authenticate as any);

  // ── Customer Success Dashboard ──
  fastify.get('/dashboard', async (request) => {
    const { userId } = await (request as any).authenticate();

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Fetch all source data in parallel
    const [
      comments,
      dms,
      leads,
      deals,
      escalations,
      missedOpps,
      approvals,
      brandSettings,
      metaConnections,
      knowledgeDocs,
      ctaConfigs,
      user,
      subscription,
      insights,
      reputationAlerts,
    ] = await Promise.all([
      fastify.prisma.socialComment.findMany({ where: { userId } }),
      fastify.prisma.dMConversation.findMany({ where: { userId } }),
      fastify.prisma.lead.findMany({ where: { userId } }),
      fastify.prisma.cRMDeal.findMany({
        where: { userId },
        include: { lead: { select: { source: true } } },
      }),
      fastify.prisma.escalationTicket.findMany({ where: { userId } }),
      fastify.prisma.missedOpportunity.findMany({ where: { userId } }),
      fastify.prisma.approvalRequest.findMany({ where: { userId } }),
      fastify.prisma.brandSettings.findUnique({ where: { userId } }),
      fastify.prisma.metaConnection.findMany({ where: { userId } }),
      fastify.prisma.knowledgeDocument.findMany({ where: { userId } }),
      fastify.prisma.cTAConfig.findMany({ where: { userId } }),
      fastify.prisma.user.findUnique({ where: { id: userId }, select: { onboardingDone: true, createdAt: true } }),
      fastify.prisma.subscription.findUnique({ where: { userId } }),
      fastify.prisma.insight.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 5 }),
      fastify.prisma.escalationTicket.findMany({ where: { userId, reputationAlert: true, status: 'open' } }),
    ]);

    // ── Compute sub-scores (each 0-100) ──

    // 1. Setup Score (20% weight) — onboarding done, meta connected, knowledge, CTA, personality
    const setupScore = [
      user?.onboardingDone ? 20 : 0,
      metaConnections.length > 0 ? 20 : 0,
      knowledgeDocs.length > 0 ? 20 : 0,
      ctaConfigs.length > 0 ? 20 : 0,
      brandSettings?.defaultPersonality && brandSettings.defaultPersonality !== 'friendly' ? 20 : 0,
    ].reduce((a, b) => a + b, 0);

    // 2. Engagement Score (25% weight) — comments replied, DMs resolved, inbox activity
    const totalComments = comments.length;
    const repliedComments = comments.filter(c => c.replyStatus === 'replied').length;
    const commentReplyRate = totalComments > 0 ? repliedComments / totalComments : 0;
    const totalDms = dms.length;
    const resolvedDms = dms.filter(d => d.status === 'resolved').length;
    const dmResolveRate = totalDms > 0 ? resolvedDms / totalDms : 0;
    const engagementScore = Math.round(
      (commentReplyRate * 40 + dmResolveRate * 40 +
        Math.min(totalComments + totalDms, 100) / 100 * 20)
    );

    // 3. Lead Generation Score (25% weight) — leads total, hot leads, lead quality
    const totalLeads = leads.length;
    const hotLeads = leads.filter(l => l.category === 'hot' || l.category === 'vip').length;
    const recentLeads = leads.filter(l => l.createdAt >= thirtyDaysAgo).length;
    const leadScore = Math.round(
      Math.min(totalLeads, 200) / 200 * 30 +
      Math.min(hotLeads, 50) / 50 * 40 +
      Math.min(recentLeads, 50) / 50 * 30
    );

    // 4. Revenue Score (20% weight) — deals won, revenue, AI attribution
    const wonDeals = deals.filter(d => d.stage === 'won');
    const totalRevenue = wonDeals.reduce((sum, d) => sum + (d.revenue || d.value || 0), 0);
    const aiDeals = deals.filter(d => d.lead?.source === 'comment' || d.lead?.source === 'dm');
    const aiWonDeals = aiDeals.filter(d => d.stage === 'won');
    const aiRevenue = aiWonDeals.reduce((sum, d) => sum + (d.revenue || d.value || 0), 0);
    const revenueScore = Math.round(
      Math.min(wonDeals.length, 20) / 20 * 35 +
      Math.min(totalRevenue, 100000) / 100000 * 35 +
      Math.min(aiRevenue, 50000) / 50000 * 30
    );

    // 5. Reputation Score (10% weight) — sentiment, escalations, alerts
    const commentsWithSentiment = comments.filter(c => c.sentiment !== null);
    const positiveComments = commentsWithSentiment.filter(c => (c.sentiment as number) > 0.3).length;
    const positivePct = commentsWithSentiment.length > 0 ? positiveComments / commentsWithSentiment.length : 0;
    const openEscalations = escalations.filter(e => e.status === 'open').length;
    const repScore = Math.round(
      positivePct * 50 +
      Math.max(0, 50 - openEscalations * 10 - reputationAlerts.length * 15)
    );

    // ── Composite Success Score ──
    const successScore = Math.round(
      setupScore * 0.20 +
      engagementScore * 0.25 +
      leadScore * 0.25 +
      revenueScore * 0.20 +
      repScore * 0.10
    );

    // ── Sub-scores breakdown ──
    const scoreBreakdown = [
      { key: 'setup', label: 'Setup & Onboarding', score: setupScore, maxScore: 100, weight: '20%', description: 'How well your account is configured for success' },
      { key: 'engagement', label: 'Customer Engagement', score: engagementScore, maxScore: 100, weight: '25%', description: 'How effectively you reply to comments and DMs' },
      { key: 'leads', label: 'Lead Generation', score: leadScore, maxScore: 100, weight: '25%', description: 'Quality and quantity of leads captured' },
      { key: 'revenue', label: 'Revenue Impact', score: revenueScore, maxScore: 100, weight: '20%', description: 'Deals closed and AI-attributed revenue' },
      { key: 'reputation', label: 'Reputation Health', score: repScore, maxScore: 100, weight: '10%', description: 'Customer sentiment and brand reputation' },
    ];

    // ── Milestones ──
    const milestones: Array<{ key: string; label: string; achieved: boolean; achievedAt?: string; icon: string }> = [
      { key: 'account_created', label: 'Account Created', achieved: true, achievedAt: user?.createdAt?.toISOString(), icon: 'user-plus' },
      { key: 'meta_connected', label: 'Social Account Connected', achieved: metaConnections.length > 0, icon: 'globe' },
      { key: 'first_lead', label: 'First Lead Captured', achieved: totalLeads > 0, icon: 'users' },
      { key: 'first_reply', label: 'First AI Reply Sent', achieved: repliedComments > 0 || resolvedDms > 0, icon: 'message-square' },
      { key: 'faq_uploaded', label: 'Knowledge Base Started', achieved: knowledgeDocs.length > 0, icon: 'book-open' },
      { key: 'cta_configured', label: 'CTA Configured', achieved: ctaConfigs.length > 0, icon: 'target' },
      { key: 'first_deal', label: 'First Deal Won', achieved: wonDeals.length > 0, icon: 'trophy' },
      { key: 'ai_revenue', label: 'AI-Generated Revenue', achieved: aiRevenue > 0, icon: 'dollar-sign' },
      { key: 'team_member', label: 'Team Member Added', achieved: false, icon: 'user-check' },
      { key: 'all_setup', label: 'Full Automation Active', achieved: !!(user?.onboardingDone && metaConnections.length > 0 && knowledgeDocs.length > 0 && ctaConfigs.length > 0), icon: 'zap' },
    ];

    // ── Recommendations ──
    const recommendations: Array<{ priority: 'high' | 'medium' | 'low'; category: string; message: string; actionLabel: string; actionLink: string }> = [];

    // High priority
    const pendingComments = comments.filter(c => c.replyStatus === 'pending').length;
    if (pendingComments > 0) {
      recommendations.push({
        priority: 'high', category: 'engagement',
        message: `${pendingComments} comment${pendingComments > 1 ? 's' : ''} ${pendingComments > 1 ? 'are' : 'is'} waiting for a reply. Respond quickly to keep leads warm.`,
        actionLabel: 'View Comments', actionLink: '/inbox',
      });
    }
    const openMissed = missedOpps.filter(o => o.status === 'open');
    const missedValue = openMissed.reduce((s, o) => s + (o.potentialValue || 0), 0);
    if (openMissed.length > 0) {
      recommendations.push({
        priority: 'high', category: 'revenue',
        message: `${openMissed.length} missed opportunit${openMissed.length > 1 ? 'ies' : 'y'} worth ₹${missedValue.toLocaleString()} — recover them now.`,
        actionLabel: 'Recover Opportunities', actionLink: '/missed-opportunities',
      });
    }
    if (!metaConnections.length) {
      recommendations.push({
        priority: 'high', category: 'setup',
        message: 'Connect your Instagram or Facebook account to start receiving messages from customers.',
        actionLabel: 'Connect Meta', actionLink: '/onboarding',
      });
    }

    // Medium priority
    if (pendingComments === 0 && totalComments > 0 && commentReplyRate === 1) {
      recommendations.push({
        priority: 'medium', category: 'growth',
        message: 'Great job replying to all comments! Now focus on converting conversations into leads.',
        actionLabel: 'View Leads', actionLink: '/leads',
      });
    }
    if (knowledgeDocs.length === 0) {
      recommendations.push({
        priority: 'medium', category: 'setup',
        message: 'Upload FAQs and product info so AI can answer customer questions accurately.',
        actionLabel: 'Upload Knowledge', actionLink: '/knowledge',
      });
    }
    if (hotLeads > 0) {
      recommendations.push({
        priority: 'medium', category: 'sales',
        message: `${hotLeads} hot lead${hotLeads > 1 ? 's' : ''} ready for follow-up. Contact them within 24 hours for best conversion.`,
        actionLabel: 'View Hot Leads', actionLink: '/leads?category=hot',
      });
    }
    if (openEscalations > 0) {
      recommendations.push({
        priority: 'medium', category: 'support',
        message: `${openEscalations} escalation${openEscalations > 1 ? 's' : ''} ${openEscalations > 1 ? 'need' : 'needs'} attention to protect your reputation.`,
        actionLabel: 'View Escalations', actionLink: '/inbox',
      });
    }

    // Low priority
    if (reputationAlerts.length > 0) {
      recommendations.push({
        priority: 'low', category: 'reputation',
        message: `${reputationAlerts.length} reputation alert${reputationAlerts.length > 1 ? 's' : ''} — address them to maintain your brand image.`,
        actionLabel: 'View Alerts', actionLink: '/reputation',
      });
    }
    if (ctaConfigs.length === 0) {
      recommendations.push({
        priority: 'low', category: 'conversion',
        message: 'Add a call-to-action button to convert more conversations into booked appointments or calls.',
        actionLabel: 'Configure CTA', actionLink: '/settings',
      });
    }
    if (aiRevenue > 0) {
      recommendations.push({
        priority: 'low', category: 'insight',
        message: `AI has generated ${formatCurrency(aiRevenue)} in revenue — ${Math.round((aiRevenue / (totalRevenue || 1)) * 100)}% of total. Review which channels work best.`,
        actionLabel: 'View Analytics', actionLink: '/insights',
      });
    }

    // ── Weekly Trends ──
    const thisWeek = [
      comments.filter(c => c.createdAt >= sevenDaysAgo).length,
      leads.filter(l => l.createdAt >= sevenDaysAgo).length,
      deals.filter(d => d.createdAt >= sevenDaysAgo).length,
    ];
    const prevWeekStart = new Date(sevenDaysAgo.getTime() - 7 * 24 * 60 * 60 * 1000);
    const prevWeek = [
      comments.filter(c => c.createdAt >= prevWeekStart && c.createdAt < sevenDaysAgo).length,
      leads.filter(l => l.createdAt >= prevWeekStart && l.createdAt < sevenDaysAgo).length,
      deals.filter(d => d.createdAt >= prevWeekStart && d.createdAt < sevenDaysAgo).length,
    ];

    const trends = [
      {
        key: 'comments', label: 'Comments',
        current: thisWeek[0], previous: prevWeek[0],
        direction: thisWeek[0] > prevWeek[0] ? 'up' : thisWeek[0] < prevWeek[0] ? 'down' : 'stable',
      },
      {
        key: 'leads', label: 'Leads',
        current: thisWeek[1], previous: prevWeek[1],
        direction: thisWeek[1] > prevWeek[1] ? 'up' : thisWeek[1] < prevWeek[1] ? 'down' : 'stable',
      },
      {
        key: 'deals', label: 'Deals',
        current: thisWeek[2], previous: prevWeek[2],
        direction: thisWeek[2] > prevWeek[2] ? 'up' : thisWeek[2] < prevWeek[2] ? 'down' : 'stable',
      },
    ];

    // ── Summary narrative ──
    let summary = '';
    if (totalLeads === 0 && totalComments === 0) {
      summary = 'Welcome to KluConnect! You\'re all set up and ready to go. Connect your social accounts and the AI will start engaging with your customers, generating leads, and driving revenue automatically.';
    } else if (successScore >= 80) {
      summary = `Your AI sales agent is performing excellently! With a success score of ${successScore}/100, you've mastered lead generation (${totalLeads} leads), customer engagement (${commentReplyRate * 100}% reply rate), and revenue growth (${formatCurrency(totalRevenue)}). Keep up the great work!`;
    } else if (successScore >= 50) {
      summary = `Good progress! Your success score is ${successScore}/100. You've generated ${totalLeads} leads and ${wonDeals.length > 0 ? `closed ${wonDeals.length} deals worth ${formatCurrency(totalRevenue)}` : 'are building your pipeline'}. Focus on ${recommendations[0]?.message.toLowerCase() || 'completing your setup'} to reach the next level.`;
    } else {
      summary = `Getting started! Your success score is ${successScore}/100. ${totalLeads > 0 ? `You've captured ${totalLeads} leads so far. ` : ''}Complete your setup — connect accounts, upload FAQs, and configure CTAs — to unlock your AI sales agent's full potential.`;
    }

    return {
      success: true,
      data: {
        successScore,
        scoreBreakdown,
        summary,
        milestones,
        recommendations: recommendations.sort((a, b) =>
          ({ high: 0, medium: 1, low: 2 }[a.priority] as number) -
          ({ high: 0, medium: 1, low: 2 }[b.priority] as number)
        ),
        trends,
        metrics: {
          totalLeads,
          hotLeads,
          totalComments,
          repliedComments,
          commentReplyRate: Math.round(commentReplyRate * 100),
          totalDms,
          resolvedDms,
          dmResolveRate: Math.round(dmResolveRate * 100),
          wonDeals: wonDeals.length,
          totalRevenue: Math.round(totalRevenue),
          aiRevenue: Math.round(aiRevenue),
          openEscalations,
          openMissed: openMissed.length,
          pendingApprovals: approvals.filter(a => a.status === 'pending').length,
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

export default customerSuccessRoutes;
