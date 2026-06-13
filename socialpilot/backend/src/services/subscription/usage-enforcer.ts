// ──────────────────────────────────────────────
// MetaPilot AI — Usage Limits & Metering
// ──────────────────────────────────────────────

export interface UsageCheckResult {
  allowed: boolean;
  metric: string;
  usage: number;
  limit: number;
  percentage: number;
  warning?: 'none' | 'warning_80' | 'warning_90' | 'exceeded';
  error?: string;
}

const WARNING_80_PCT = 0.8;
const WARNING_90_PCT = 0.9;

export const usageEnforcer = {
  /**
   * Check if a user has capacity for a given metric.
   * Returns the check result with warning level.
   */
  async checkLimit(
    prisma: any,
    userId: string,
    metric: string,
    periodStart: Date,
  ): Promise<UsageCheckResult> {
    // Get subscription to find the limit
    const sub = await prisma.subscription.findUnique({ where: { userId } });

    if (!sub) {
      // No subscription = free plan limits
      return {
        allowed: true,
        metric,
        usage: 0,
        limit: 100, // free plan AI response limit
        percentage: 0,
        warning: 'none',
      };
    }

    const limit = this._getLimitForMetric(sub, metric);
    if (limit >= 999999) {
      // Unlimited — always allowed
      return {
        allowed: true,
        metric,
        usage: 0,
        limit,
        percentage: 0,
        warning: 'none',
      };
    }

    // Get current usage for this period
    const usageAgg = await prisma.usageRecord.aggregate({
      where: {
        userId,
        metric,
        date: { gte: periodStart },
      },
      _sum: { count: true },
    });

    const usage = usageAgg._sum?.count || 0;
    const percentage = usage / limit;

    let warning: UsageCheckResult['warning'] = 'none';
    let allowed = true;

    if (percentage >= 1) {
      warning = 'exceeded';
      allowed = false;
    } else if (percentage >= WARNING_90_PCT) {
      warning = 'warning_90';
    } else if (percentage >= WARNING_80_PCT) {
      warning = 'warning_80';
    }

    return {
      allowed,
      metric,
      usage,
      limit,
      percentage: Math.round(percentage * 100),
      warning,
      error: allowed ? undefined : `You've reached your ${this._metricLabel(metric)} limit. Upgrade your plan to continue.`,
    };
  },

  /**
   * Record usage increment for a metric.
   */
  async recordUsage(
    prisma: any,
    userId: string,
    metric: string,
    count: number = 1,
  ): Promise<void> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Upsert today's usage record
    await prisma.usageRecord.upsert({
      where: {
        userId_metric_date: {
          userId,
          metric,
          date: today,
        },
      },
      update: {
        count: { increment: count },
      },
      create: {
        userId,
        metric,
        count,
        date: today,
      },
    });
  },

  /**
   * Get all usage stats for a user (aggregated across all metrics).
   */
  async getAllUsage(
    prisma: any,
    userId: string,
  ): Promise<{
    aiResponses: { used: number; limit: number; percentage: number };
    leads: { used: number; limit: number; percentage: number };
    connections: { used: number; limit: number; percentage: number };
    teamMembers: { used: number; limit: number; percentage: number };
    knowledgeDocs: { used: number; limit: number; percentage: number };
  }> {
    const sub = await prisma.subscription.findUnique({ where: { userId } });

    const limits: {
      aiResponses: number; leads: number; connections: number;
      teamMembers: number; crmDeals: number;
    } = sub ? {
      aiResponses: sub.aiResponseLimit,
      leads: sub.maxLeads,
      connections: sub.maxConnections,
      teamMembers: sub.maxTeamMembers,
      crmDeals: sub.maxCrmDeals,
    } : {
      aiResponses: 100, leads: 50, connections: 1, teamMembers: 1, crmDeals: 25,
    };

    const periodStart = sub?.currentPeriodStart || new Date(0);

    // Counts for non-aggregated metrics
    const [aiUsageAgg, leadsUsageAgg, connectionCount, teamCount, knowledgeCount] =
      await Promise.all([
        prisma.usageRecord.aggregate({
          where: { userId, metric: 'ai_responses', date: { gte: periodStart } },
          _sum: { count: true },
        }),
        prisma.lead.count({ where: { userId, createdAt: { gte: periodStart } } }),
        prisma.metaConnection.count({ where: { userId } }),
        prisma.teamMember.count({ where: { userId } }),
        prisma.knowledgeDocument.count({ where: { userId } }),
      ]);

    const aiUsed = aiUsageAgg._sum?.count || 0;

    return {
      aiResponses: {
        used: aiUsed,
        limit: limits.aiResponses,
        percentage: limits.aiResponses >= 999999 ? 0 : Math.round((aiUsed / limits.aiResponses) * 100),
      },
      leads: {
        used: leadsUsageAgg,
        limit: limits.leads,
        percentage: limits.leads >= 999999 ? 0 : Math.round((leadsUsageAgg / limits.leads) * 100),
      },
      connections: {
        used: connectionCount,
        limit: limits.connections,
        percentage: limits.connections >= 999999 ? 0 : Math.round((connectionCount / limits.connections) * 100),
      },
      teamMembers: {
        used: teamCount,
        limit: limits.teamMembers,
        percentage: limits.teamMembers >= 999999 ? 0 : Math.round((teamCount / limits.teamMembers) * 100),
      },
      knowledgeDocs: {
        used: knowledgeCount,
        limit: sub?.maxKnowledgeDocs || 999999,
        percentage: (sub?.maxKnowledgeDocs && sub.maxKnowledgeDocs < 999999)
          ? Math.round((knowledgeCount / sub.maxKnowledgeDocs) * 100)
          : 0,
      },
    };
  },

  /**
   * Get the plan limit for a given metric.
   */
  _getLimitForMetric(sub: any, metric: string): number {
    switch (metric) {
      case 'ai_responses': return sub.aiResponseLimit;
      case 'leads_captured': return sub.maxLeads;
      case 'meta_connections': return sub.maxConnections;
      case 'team_members': return sub.maxTeamMembers;
      case 'crm_deals': return sub.maxCrmDeals;
      case 'knowledge_docs': return sub.maxKnowledgeDocs;
      default: return 999999;
    }
  },

  /**
   * Human-readable label for a metric.
   */
  _metricLabel(metric: string): string {
    const labels: Record<string, string> = {
      ai_responses: 'AI Replies',
      leads_captured: 'Leads',
      meta_connections: 'Meta Accounts',
      team_members: 'Team Members',
      crm_deals: 'CRM Deals',
      knowledge_docs: 'Knowledge Documents',
      ai_token_usage: 'AI Token Usage',
    };
    return labels[metric] || metric;
  },
};
