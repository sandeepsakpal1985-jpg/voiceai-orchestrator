import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { captureEvent, Events } from '../../services/analytics/posthog';

const crmRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', fastify.authenticate as any);

  // List deals grouped by stage (for Kanban)
  fastify.get('/', async (request) => {
    const { userId } = await (request as any).authenticate();
    const deals = await fastify.prisma.cRMDeal.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      include: { lead: { select: { name: true, socialHandle: true, platform: true, email: true, phone: true } } },
    });
    
    const grouped: Record<string, any[]> = {
      new_lead: [], contacted: [], qualified: [], demo_scheduled: [],
      proposal_sent: [], negotiation: [], won: [], lost: [],
    };
    for (const deal of deals) {
      if (!grouped[deal.stage]) grouped[deal.stage] = [];
      grouped[deal.stage].push(deal);
    }
    
    return { success: true, data: grouped };
  });

  // Get deal
  fastify.get('/:id', async (request, reply) => {
    const { userId } = await (request as any).authenticate();
    const { id } = request.params as { id: string };
    const deal = await fastify.prisma.cRMDeal.findFirst({
      where: { id, userId },
      include: {
        lead: true,
        activities: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!deal) return reply.status(404).send({ success: false, error: 'Deal not found' });
    return { success: true, data: deal };
  });

  // Update deal stage
  fastify.put('/:id/stage', async (request, reply) => {
    const { userId } = await (request as any).authenticate();
    const { id } = request.params as { id: string };
    const schema = z.object({
      stage: z.enum(['new_lead', 'contacted', 'qualified', 'demo_scheduled', 'proposal_sent', 'negotiation', 'won', 'lost']),
    });
    const { stage } = schema.parse(request.body);
    
    const deal = await fastify.prisma.cRMDeal.findFirst({ where: { id, userId } });
    if (!deal) return reply.status(404).send({ success: false, error: 'Deal not found' });
    
    const updated = await fastify.prisma.cRMDeal.update({ where: { id }, data: { stage } });
    
    // Log activity
    await fastify.prisma.cRMActivity.create({
      data: { dealId: id, type: 'note', content: `Moved to ${stage}`, createdBy: userId },
    });

    // Track stage change with special events for won/lost
    captureEvent(userId, Events.CRM_DEAL_STAGE_CHANGED, {
      dealId: id,
      fromStage: deal.stage,
      toStage: stage,
      value: updated.value,
    });

    if (stage === 'won') {
      captureEvent(userId, Events.CRM_DEAL_WON, {
        dealId: id,
        value: updated.value,
        title: updated.title,
      });
    } else if (stage === 'lost') {
      captureEvent(userId, Events.CRM_DEAL_LOST, {
        dealId: id,
        value: updated.value,
        fromStage: deal.stage,
      });
    }
    
    return { success: true, data: updated };
  });

  // Add activity
  fastify.post('/:id/activities', async (request, reply) => {
    const { userId } = await (request as any).authenticate();
    const { id } = request.params as { id: string };
    const schema = z.object({
      type: z.enum(['note', 'call', 'email', 'demo', 'meeting', 'follow_up']),
      content: z.string().min(1),
    });
    const body = schema.parse(request.body);
    
    const deal = await fastify.prisma.cRMDeal.findFirst({ where: { id, userId } });
    if (!deal) return reply.status(404).send({ success: false, error: 'Deal not found' });
    
    const activity = await fastify.prisma.cRMActivity.create({
      data: { dealId: id, type: body.type, content: body.content, createdBy: userId },
    });
    return { success: true, data: activity };
  });

  // Update deal
  fastify.put('/:id', async (request, reply) => {
    const { userId } = await (request as any).authenticate();
    const { id } = request.params as { id: string };
    const schema = z.object({
      title: z.string().optional(),
      value: z.number().optional(),
      assignedTo: z.string().optional(),
      notes: z.string().optional(),
      followUpAt: z.string().optional(),
    });
    const body = schema.parse(request.body);
    
    const deal = await fastify.prisma.cRMDeal.findFirst({ where: { id, userId } });
    if (!deal) return reply.status(404).send({ success: false, error: 'Deal not found' });
    
    const updateData: any = { ...body };
    if (body.followUpAt) {
      updateData.followUpAt = new Date(body.followUpAt);
    }
    
    const updated = await fastify.prisma.cRMDeal.update({ where: { id }, data: updateData });
    
    return { success: true, data: updated };
  });
};

export default crmRoutes;
