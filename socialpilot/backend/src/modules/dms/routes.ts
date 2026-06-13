import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { usageEnforcer } from '../../services/subscription/usage-enforcer';

const dmRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', fastify.authenticate as any);

  // List conversations
  fastify.get('/', async (request) => {
    const { userId } = await (request as any).authenticate();
    const query = request.query as { page?: string; limit?: string; status?: string };
    const page = parseInt(query.page || '1');
    const limit = parseInt(query.limit || '20');
    
    const where: any = { userId };
    if (query.status) where.status = query.status;
    
    const [data, total] = await Promise.all([
      fastify.prisma.dMConversation.findMany({
        where,
        orderBy: { lastActivityAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { _count: { select: { messages: true } } },
      }),
      fastify.prisma.dMConversation.count({ where }),
    ]);
    
    return { success: true, data, total, page, limit, totalPages: Math.ceil(total / limit) };
  });

  // Get conversation with messages
  fastify.get('/:id', async (request, reply) => {
    const { userId } = await (request as any).authenticate();
    const { id } = request.params as { id: string };
    
    const conversation = await fastify.prisma.dMConversation.findFirst({
      where: { id, userId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!conversation) return reply.status(404).send({ success: false, error: 'Conversation not found' });
    
    return { success: true, data: conversation };
  });

  // Send a message (simulated — stores in DB for demo)
  fastify.post('/:id/messages', async (request, reply) => {
    const { userId } = await (request as any).authenticate();
    const { id } = request.params as { id: string };
    const schema = z.object({ content: z.string().min(1) });
    const { content } = schema.parse(request.body);
    
    const conversation = await fastify.prisma.dMConversation.findFirst({
      where: { id, userId },
    });
    if (!conversation) return reply.status(404).send({ success: false, error: 'Conversation not found' });
    
    // Check usage limit before proceeding
    const sub = await fastify.prisma.subscription.findUnique({ where: { userId } });
    const periodStart = sub?.currentPeriodStart || new Date(0);
    const check = await usageEnforcer.checkLimit(fastify.prisma, userId, 'ai_responses', periodStart);
    if (!check.allowed) {
      return reply.status(403).send({ success: false, error: 'AI reply limit reached. Upgrade your plan to continue.' });
    }

    const message = await fastify.prisma.dMMessage.create({
      data: {
        conversationId: id,
        senderId: userId,
        content,
        role: 'assistant',
      },
    });
    
    // Update last activity
    await fastify.prisma.dMConversation.update({
      where: { id },
      data: { lastActivityAt: new Date() },
    });
    
    // Record usage
    await usageEnforcer.recordUsage(fastify.prisma, userId, 'ai_responses');
    
    return { success: true, data: message };
  });
};

export default dmRoutes;
