import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { captureEvent, Events } from '../../services/analytics/posthog';

const leadRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', fastify.authenticate as any);

  // List leads
  fastify.get('/', async (request) => {
    const { userId } = await (request as any).authenticate();
    const q = request.query as { page?: string; limit?: string; category?: string; search?: string };
    const page = parseInt(q.page || '1');
    const limit = parseInt(q.limit || '20');
    
    const where: any = { userId };
    if (q.category) where.category = q.category;
    if (q.search) {
      where.OR = [
        { name: { contains: q.search, mode: 'insensitive' } },
        { socialHandle: { contains: q.search, mode: 'insensitive' } },
        { email: { contains: q.search, mode: 'insensitive' } },
      ];
    }
    
    const [data, total] = await Promise.all([
      fastify.prisma.lead.findMany({
        where,
        orderBy: { leadScore: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      fastify.prisma.lead.count({ where }),
    ]);
    
    return { success: true, data, total, page, limit, totalPages: Math.ceil(total / limit) };
  });

  // Get lead
  fastify.get('/:id', async (request, reply) => {
    const { userId } = await (request as any).authenticate();
    const { id } = request.params as { id: string };
    const lead = await fastify.prisma.lead.findFirst({ where: { id, userId } });
    if (!lead) return reply.status(404).send({ success: false, error: 'Lead not found' });
    
    // Include CRM deal and conversation history
    const deal = await fastify.prisma.cRMDeal.findUnique({ where: { leadId: id } });
    const memory = await fastify.prisma.customerMemory.findFirst({
      where: { userId, socialHandle: lead.socialHandle },
    });
    
    return { success: true, data: { ...lead, deal, memory } };
  });

  // Update lead
  fastify.put('/:id', async (request, reply) => {
    const { userId } = await (request as any).authenticate();
    const { id } = request.params as { id: string };
    const schema = z.object({
      name: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().optional(),
      company: z.string().optional(),
      city: z.string().optional(),
      requirement: z.string().optional(),
      budget: z.string().optional(),
      category: z.enum(['cold', 'warm', 'hot', 'vip']).optional(),
      tags: z.array(z.string()).optional(),
    });
    const body = schema.parse(request.body);
    
    const lead = await fastify.prisma.lead.findFirst({ where: { id, userId } });
    if (!lead) return reply.status(404).send({ success: false, error: 'Lead not found' });
    
    const updated = await fastify.prisma.lead.update({ where: { id }, data: body });

    captureEvent(userId, Events.LEAD_UPDATED, {
      leadId: id,
      category: updated.category,
    });

    return { success: true, data: updated };
  });

  // Convert lead to CRM deal
  fastify.post('/:id/convert', async (request, reply) => {
    const { userId } = await (request as any).authenticate();
    const { id } = request.params as { id: string };
    const schema = z.object({
      title: z.string().min(1),
      value: z.number().optional(),
    });
    const body = schema.parse(request.body);
    
    const lead = await fastify.prisma.lead.findFirst({
      where: { id, userId },
      include: { crmDeal: true },
    });
    if (!lead) return reply.status(404).send({ success: false, error: 'Lead not found' });
    if (lead.crmDeal) return reply.status(409).send({ success: false, error: 'Lead already has a CRM deal' });
    
    const deal = await fastify.prisma.cRMDeal.create({
      data: {
        userId,
        leadId: id,
        title: body.title,
        value: body.value,
        stage: 'new_lead',
        leadScore: lead.leadScore,
        sentiment: lead.sentiment,
      },
    });

    captureEvent(userId, Events.LEAD_CONVERTED, {
      leadId: id,
      dealId: deal.id,
      value: body.value,
    });
    
    return { success: true, data: deal };
  });

  // Export leads
  fastify.get('/export', async (request) => {
    const { userId } = await (request as any).authenticate();
    const leads = await fastify.prisma.lead.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return { success: true, data: leads };
  });
};

export default leadRoutes;
