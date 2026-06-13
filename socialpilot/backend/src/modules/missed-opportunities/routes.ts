import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

const missedOpportunityRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', fastify.authenticate as any);

  // List missed opportunities
  fastify.get('/', async (request) => {
    const { userId } = await (request as any).authenticate();
    const q = request.query as { status?: string; type?: string };
    const where: any = { userId };
    if (q.status) where.status = q.status;
    if (q.type) where.type = q.type;

    const opportunities = await fastify.prisma.missedOpportunity.findMany({
      where,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });
    return { success: true, data: opportunities };
  });

  // Get single missed opportunity
  fastify.get('/:id', async (request, reply) => {
    const { userId } = await (request as any).authenticate();
    const { id } = request.params as { id: string };
    const opp = await fastify.prisma.missedOpportunity.findFirst({ where: { id, userId } });
    if (!opp) return reply.status(404).send({ success: false, error: 'Not found' });
    return { success: true, data: opp };
  });

  // Resolve / dismiss a missed opportunity
  fastify.put('/:id', async (request, reply) => {
    const { userId } = await (request as any).authenticate();
    const { id } = request.params as { id: string };
    const schema = z.object({
      status: z.enum(['resolved', 'dismissed']).optional(),
      recommendedAction: z.string().optional(),
    });
    const body = schema.parse(request.body);

    const opp = await fastify.prisma.missedOpportunity.findFirst({ where: { id, userId } });
    if (!opp) return reply.status(404).send({ success: false, error: 'Not found' });

    const updateData: any = { ...body };
    if (body.status === 'resolved') updateData.resolvedAt = new Date();

    const updated = await fastify.prisma.missedOpportunity.update({ where: { id }, data: updateData });
    return { success: true, data: updated };
  });

  // Recover lead from missed opportunity
  fastify.post('/:id/recover', async (request, reply) => {
    const { userId } = await (request as any).authenticate();
    const { id } = request.params as { id: string };

    const opp = await fastify.prisma.missedOpportunity.findFirst({ where: { id, userId } });
    if (!opp) return reply.status(404).send({ success: false, error: 'Not found' });

    // Create a lead from this missed opportunity
    const lead = await fastify.prisma.lead.create({
      data: {
        userId,
        name: opp.customerName || opp.customerHandle || 'Unknown',
        socialHandle: opp.customerHandle || 'unknown',
        platform: opp.platform || 'instagram',
        source: 'manual',
        category: 'warm',
        leadScore: 50,
        requirement: opp.description,
        recommendedAction: opp.recommendedAction || 'Re-engage from missed opportunity',
        tags: ['recovered', 'missed_opportunity'],
      },
    });

    // Mark opportunity as resolved
    await fastify.prisma.missedOpportunity.update({
      where: { id },
      data: { status: 'resolved', resolvedAt: new Date() },
    });

    return { success: true, data: { lead, message: 'Lead created from recovered opportunity' } };
  });

  // Detection endpoint — analyzes comments and DMs for missed opportunities
  fastify.post('/detect', async (request) => {
    const { userId } = await (request as any).authenticate();

    const detected: Array<{
      type: string;
      description: string;
      customerHandle?: string;
      customerName?: string;
      platform?: string;
      message?: string;
      potentialValue?: number;
      recommendedAction?: string;
    }> = [];

    // 1. Detect pricing questions that were never answered
    const unansweredPricing = await fastify.prisma.socialComment.findMany({
      where: {
        userId,
        replyStatus: 'pending',
        category: 'sales_inquiry',
        content: { contains: 'price', mode: 'insensitive' },
      },
      take: 20,
    });
    for (const c of unansweredPricing) {
      detected.push({
        type: 'pricing_unanswered',
        description: `Pricing question unanswered from ${c.authorName || c.authorId}`,
        customerHandle: c.authorName || c.authorId,
        customerName: c.authorName ?? undefined,
        platform: c.platform,
        message: c.content,
        potentialValue: 100,
        recommendedAction: 'Reply with pricing information and qualify the lead',
      });
    }

    // 2. Detect purchase intent unanswered
    const purchaseKeywords = ['buy', 'purchase', 'subscribe', 'sign up', 'order', 'get started'];
    const unansweredPurchase = await fastify.prisma.socialComment.findMany({
      where: {
        userId,
        replyStatus: 'pending',
        OR: purchaseKeywords.map(k => ({ content: { contains: k, mode: 'insensitive' } })),
      },
      take: 20,
    });
    for (const c of unansweredPurchase) {
      detected.push({
        type: 'purchase_intent_unanswered',
        description: `Purchase intent detected but unanswered from ${c.authorName || c.authorId}`,
        customerHandle: c.authorName || c.authorId,
        customerName: c.authorName ?? undefined,
        platform: c.platform,
        message: c.content,
        potentialValue: 200,
        recommendedAction: 'Respond immediately with purchase path and CTA',
      });
    }

    // 3. Detect stalled DM conversations (no reply from business in > 24h)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const stalledConversations = await fastify.prisma.dMConversation.findMany({
      where: {
        userId,
        status: 'active',
        lastActivityAt: { lt: oneDayAgo },
      },
      include: { messages: { orderBy: { createdAt: 'desc' }, take: 1 } },
      take: 20,
    });
    for (const conv of stalledConversations) {
      const lastMsg = conv.messages[0];
      if (lastMsg && lastMsg.role === 'user') {
        detected.push({
          type: 'stalled_conversation',
          description: `DM conversation stalled — customer's last message was unanswered`,
          customerHandle: conv.customerId,
          platform: conv.platform,
          message: lastMsg?.content,
          potentialValue: 150,
          recommendedAction: 'Follow up with the customer to continue the conversation',
        });
      }
    }

    // 4. Detect leads with high score but no follow-up in 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const staleHotLeads = await fastify.prisma.lead.findMany({
      where: {
        userId,
        leadScore: { gte: 50 },
        lastContactAt: { lt: sevenDaysAgo },
        category: { in: ['hot', 'vip'] },
      },
      take: 20,
    });
    for (const lead of staleHotLeads) {
      detected.push({
        type: 'missed_follow_up',
        description: `Hot lead "${lead.name || lead.socialHandle}" not contacted in 7+ days`,
        customerHandle: lead.socialHandle,
        customerName: lead.name ?? undefined,
        platform: lead.platform,
        message: lead.requirement ?? undefined,
        potentialValue: lead.leadScore >= 70 ? 500 : 200,
        recommendedAction: 'Send personalized follow-up message and re-engage the lead',
      });
    }

    // Store detected opportunities
    let created = 0;
    for (const item of detected) {
      // Avoid duplicates — check if similar opportunity already exists
      const existing = await fastify.prisma.missedOpportunity.findFirst({
        where: {
          userId,
          type: item.type,
          customerHandle: item.customerHandle,
          status: 'open',
        },
      });
      if (!existing) {
        await fastify.prisma.missedOpportunity.create({
          data: {
            userId,
            type: item.type,
            description: item.description,
            customerHandle: item.customerHandle,
            customerName: item.customerName,
            platform: item.platform,
            message: item.message,
            potentialValue: item.potentialValue,
            recommendedAction: item.recommendedAction,
          },
        });
        created++;
      }
    }

    return { success: true, data: { detected: detected.length, created, items: detected } };
  });

  // Stats
  fastify.get('/stats', async (request) => {
    const { userId } = await (request as any).authenticate();

    const [open, resolved, dismissed, total] = await Promise.all([
      fastify.prisma.missedOpportunity.count({ where: { userId, status: 'open' } }),
      fastify.prisma.missedOpportunity.count({ where: { userId, status: 'resolved' } }),
      fastify.prisma.missedOpportunity.count({ where: { userId, status: 'dismissed' } }),
      fastify.prisma.missedOpportunity.findMany({
        where: { userId, status: 'open' },
        select: { potentialValue: true },
      }),
    ]);

    const totalPotentialValue = total.reduce((sum, t) => sum + (t.potentialValue || 0), 0);

    return {
      success: true,
      data: { open, resolved, dismissed, totalPotentialValue },
    };
  });
};

export default missedOpportunityRoutes;
