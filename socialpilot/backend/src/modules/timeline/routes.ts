import { FastifyPluginAsync } from 'fastify';

const timelineRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', fastify.authenticate as any);

  // Get timeline for a specific lead
  fastify.get('/lead/:leadId', async (request, reply) => {
    const { userId } = await (request as any).authenticate();
    const { leadId } = request.params as { leadId: string };

    const lead = await fastify.prisma.lead.findFirst({ where: { id: leadId, userId } });
    if (!lead) return reply.status(404).send({ success: false, error: 'Lead not found' });

    const events: Array<{
      type: string;
      title: string;
      description: string;
      timestamp: string;
      icon?: string;
    }> = [];

    // Lead created event
    events.push({
      type: 'lead_created',
      title: 'Lead Created',
      description: `Lead "${lead.name || lead.socialHandle}" was created from ${lead.source} source`,
      timestamp: lead.createdAt.toISOString(),
      icon: 'user-plus',
    });

    // Find comments from this lead
    const commentFilters: any[] = [{ authorId: lead.socialHandle }];
    if (lead.name) commentFilters.push({ authorName: lead.name });

    const comments = await fastify.prisma.socialComment.findMany({
      where: { userId, OR: commentFilters },
      orderBy: { createdAt: 'asc' },
    });
    for (const c of comments) {
      events.push({
        type: 'comment',
        title: 'Commented',
        description: c.content,
        timestamp: c.createdAt.toISOString(),
        icon: 'message-square',
      });
      if (c.repliedAt) {
        events.push({
          type: 'ai_reply',
          title: 'AI Responded',
          description: c.replyContent || 'AI generated a reply',
          timestamp: c.repliedAt.toISOString(),
          icon: 'bot',
        });
      }
    }

    // Find DM conversations
    const convs = await fastify.prisma.dMConversation.findMany({
      where: { userId, customerId: lead.socialHandle },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
      orderBy: { createdAt: 'asc' },
    });
    for (const conv of convs) {
      events.push({
        type: 'dm_started',
        title: 'DM Started',
        description: `DM conversation #${conv.id.slice(0, 8)} — intent: ${conv.intent || 'unknown'}`,
        timestamp: conv.createdAt.toISOString(),
        icon: 'message-circle',
      });
      for (const msg of conv.messages) {
        events.push({
          type: msg.role === 'user' ? 'dm_user' : 'dm_ai',
          title: msg.role === 'user' ? 'Customer Sent Message' : 'AI Sent Message',
          description: msg.content,
          timestamp: msg.createdAt.toISOString(),
          icon: msg.role === 'user' ? 'user' : 'bot',
        });
      }
    }

    // Find CRM deal
    const deal = await fastify.prisma.cRMDeal.findUnique({
      where: { leadId },
      include: { activities: { orderBy: { createdAt: 'asc' } } },
    });
    if (deal) {
      events.push({
        type: 'deal_created',
        title: 'CRM Deal Created',
        description: `Deal "${deal.title}" — ${deal.stage.replace(/_/g, ' ')}`,
        timestamp: deal.createdAt.toISOString(),
        icon: 'trending-up',
      });
      for (const activity of deal.activities) {
        events.push({
          type: 'deal_activity',
          title: `Activity: ${activity.type}`,
          description: activity.content,
          timestamp: activity.createdAt.toISOString(),
          icon: 'activity',
        });
      }
      if (deal.stage === 'won') {
        events.push({
          type: 'deal_won',
          title: 'Deal Won! 🎉',
          description: `Revenue: ${deal.revenue || deal.value || 0}`,
          timestamp: deal.updatedAt.toISOString(),
          icon: 'trophy',
        });
      }
    }

    // Find customer memory journey
    const memory = await fastify.prisma.customerMemory.findFirst({
      where: { userId, socialHandle: lead.socialHandle },
    });
    if (memory?.journey && memory.journey.length > 0) {
      events.push({
        type: 'journey',
        title: 'Customer Journey',
        description: `Relationship: ${memory.relationshipStatus}. Steps: ${memory.journey.join(' → ')}`,
        timestamp: memory.updatedAt.toISOString(),
        icon: 'map',
      });
    }

    // Sort by timestamp ascending
    events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    return { success: true, data: events };
  });

  // Get timeline for a specific customer handle
  fastify.get('/customer/:socialHandle', async (request, reply) => {
    const { userId } = await (request as any).authenticate();
    const { socialHandle } = request.params as { socialHandle: string };

    const events: Array<{
      type: string;
      title: string;
      description: string;
      timestamp: string;
      icon?: string;
    }> = [];

    // Find comments
    const comments = await fastify.prisma.socialComment.findMany({
      where: {
        userId,
        OR: [
          { authorId: socialHandle },
          { authorName: socialHandle },
        ],
      },
      orderBy: { createdAt: 'asc' },
    });
    for (const c of comments) {
      events.push({
        type: 'comment',
        title: 'Commented',
        description: c.content,
        timestamp: c.createdAt.toISOString(),
        icon: 'message-square',
      });
    }

    // Find DM conversations
    const convs = await fastify.prisma.dMConversation.findMany({
      where: { userId, customerId: socialHandle },
      include: { messages: { orderBy: { createdAt: 'asc' }, take: 5 } },
      orderBy: { createdAt: 'asc' },
    });
    for (const conv of convs) {
      events.push({
        type: 'dm_started',
        title: 'DM Started',
        description: `Conversation — ${conv.intent || 'general'}`,
        timestamp: conv.createdAt.toISOString(),
        icon: 'message-circle',
      });
    }

    // Find leads
    const leads = await fastify.prisma.lead.findMany({
      where: {
        userId,
        OR: [
          { socialHandle },
          { name: socialHandle },
        ],
      },
    });
    for (const lead of leads) {
      events.push({
        type: 'lead_created',
        title: 'Lead Created',
        description: `Score: ${lead.leadScore} — ${lead.category}`,
        timestamp: lead.createdAt.toISOString(),
        icon: 'user-plus',
      });
      const deal = await fastify.prisma.cRMDeal.findUnique({ where: { leadId: lead.id } });
      if (deal) {
        events.push({
          type: 'deal_created',
          title: 'Deal Created',
          description: `"${deal.title}" — ${deal.stage}`,
          timestamp: deal.createdAt.toISOString(),
          icon: 'trending-up',
        });
      }
    }

    // Find memory
    const memory = await fastify.prisma.customerMemory.findFirst({
      where: { userId, socialHandle },
    });
    if (memory) {
      events.push({
        type: 'memory',
        title: 'Customer Profile',
        description: `Status: ${memory.relationshipStatus}, Score: ${memory.maxLeadScore}`,
        timestamp: memory.updatedAt.toISOString(),
        icon: 'user',
      });
    }

    events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    return { success: true, data: events };
  });
};

export default timelineRoutes;
