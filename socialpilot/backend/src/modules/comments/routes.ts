import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { usageEnforcer } from '../../services/subscription/usage-enforcer';

const commentRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', fastify.authenticate as any);

  // List comments
  fastify.get('/', async (request) => {
    const { userId } = await (request as any).authenticate();
    const query = request.query as { page?: string; limit?: string; status?: string };
    const page = parseInt(query.page || '1');
    const limit = parseInt(query.limit || '20');
    
    const where: any = { userId };
    if (query.status) where.replyStatus = query.status;
    
    const [data, total] = await Promise.all([
      fastify.prisma.socialComment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      fastify.prisma.socialComment.count({ where }),
    ]);
    
    return { success: true, data, total, page, limit, totalPages: Math.ceil(total / limit) };
  });

  // Get comment
  fastify.get('/:id', async (request, reply) => {
    const { userId } = await (request as any).authenticate();
    const { id } = request.params as { id: string };
    
    const comment = await fastify.prisma.socialComment.findFirst({
      where: { id, userId },
    });
    if (!comment) return reply.status(404).send({ success: false, error: 'Comment not found' });
    return { success: true, data: comment };
  });

  // Approve/reject draft reply
  fastify.put('/:id/review', async (request, reply) => {
    const { userId } = await (request as any).authenticate();
    const { id } = request.params as { id: string };
    const schema = z.object({
      action: z.enum(['approve', 'reject']),
      editedContent: z.string().optional(),
    });
    const body = schema.parse(request.body);
    
    const comment = await fastify.prisma.socialComment.findFirst({
      where: { id, userId },
    });
    if (!comment) return reply.status(404).send({ success: false, error: 'Comment not found' });
    
    if (body.action === 'approve') {
      await fastify.prisma.socialComment.update({
        where: { id },
        data: {
          replyStatus: 'approved',
          replyContent: body.editedContent || comment.replyContent,
        },
      });
    } else {
      await fastify.prisma.socialComment.update({
        where: { id },
        data: { replyStatus: 'pending', replyContent: null },
      });
    }
    
    return { success: true, data: { approved: body.action === 'approve' } };
  });

  // Manually reply
  fastify.post('/:id/reply', async (request, reply) => {
    const { userId } = await (request as any).authenticate();
    const { id } = request.params as { id: string };
    const schema = z.object({ content: z.string().min(1) });
    const { content } = schema.parse(request.body);
    
    const comment = await fastify.prisma.socialComment.findFirst({
      where: { id, userId },
    });
    if (!comment) return reply.status(404).send({ success: false, error: 'Comment not found' });
    
    // Check usage limit before proceeding
    const sub = await fastify.prisma.subscription.findUnique({ where: { userId } });
    const periodStart = sub?.currentPeriodStart || new Date(0);
    const check = await usageEnforcer.checkLimit(fastify.prisma, userId, 'ai_responses', periodStart);
    if (!check.allowed) {
      return reply.status(403).send({ success: false, error: 'AI reply limit reached. Upgrade your plan to continue.' });
    }
    
    // Queue actual reply via Meta API
    await fastify.prisma.socialComment.update({
      where: { id },
      data: { replyStatus: 'replied', replyContent: content, repliedAt: new Date() },
    });
    
    // Record usage
    await usageEnforcer.recordUsage(fastify.prisma, userId, 'ai_responses');
    
    return { success: true, data: { replied: true } };
  });
};

export default commentRoutes;
