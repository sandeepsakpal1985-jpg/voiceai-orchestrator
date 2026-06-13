import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { broadcast } from '../../services/websocket/ws-notify';

const inboxRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', fastify.authenticate as any);

  // List inbox items
  fastify.get('/', async (request) => {
    const { userId } = await (request as any).authenticate();
    const q = request.query as { page?: string; limit?: string; status?: string; priority?: string; type?: string; platform?: string };
    const page = parseInt(q.page || '1');
    const limit = parseInt(q.limit || '20');
    
    const where: any = { userId };
    if (q.status) where.status = q.status;
    if (q.priority) where.priority = q.priority;
    if (q.type) where.type = q.type;
    if (q.platform) where.platform = q.platform;
    
    const [data, total] = await Promise.all([
      fastify.prisma.inboxItem.findMany({
        where,
        orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      fastify.prisma.inboxItem.count({ where }),
    ]);
    
    return { success: true, data, total, page, limit, totalPages: Math.ceil(total / limit) };
  });

  // Get inbox item
  fastify.get('/:id', async (request, reply) => {
    const { userId } = await (request as any).authenticate();
    const { id } = request.params as { id: string };
    const item = await fastify.prisma.inboxItem.findFirst({ where: { id, userId } });
    if (!item) return reply.status(404).send({ success: false, error: 'Item not found' });
    
    // Mark as read
    if (item.status === 'unread') {
      await fastify.prisma.inboxItem.update({ where: { id }, data: { status: 'read' } });
    }
    
    return { success: true, data: item };
  });

  // Update internal note
  fastify.put('/:id/note', async (request, reply) => {
    const { userId } = await (request as any).authenticate();
    const { id } = request.params as { id: string };
    const schema = z.object({ internalNote: z.string() });
    const { internalNote } = schema.parse(request.body);
    
    const item = await fastify.prisma.inboxItem.findFirst({ where: { id, userId } });
    if (!item) return reply.status(404).send({ success: false, error: 'Item not found' });
    
    const updated = await fastify.prisma.inboxItem.update({ where: { id }, data: { internalNote } });
    return { success: true, data: updated };
  });

  // Assign item
  fastify.put('/:id/assign', async (request, reply) => {
    const { userId } = await (request as any).authenticate();
    const { id } = request.params as { id: string };
    const schema = z.object({ assignedTo: z.string() });
    const { assignedTo } = schema.parse(request.body);
    
    const item = await fastify.prisma.inboxItem.findFirst({ where: { id, userId } });
    if (!item) return reply.status(404).send({ success: false, error: 'Item not found' });
    
    const updated = await fastify.prisma.inboxItem.update({ where: { id }, data: { assignedTo } });
    return { success: true, data: updated };
  });

  // Update status
  fastify.put('/:id/status', async (request, reply) => {
    const { userId } = await (request as any).authenticate();
    const { id } = request.params as { id: string };
    const schema = z.object({ status: z.enum(['unread', 'read', 'replied', 'escalated', 'resolved']) });
    const { status } = schema.parse(request.body);
    
    const item = await fastify.prisma.inboxItem.findFirst({ where: { id, userId } });
    if (!item) return reply.status(404).send({ success: false, error: 'Item not found' });
    
    const updated = await fastify.prisma.inboxItem.update({ where: { id }, data: { status } });

    // Broadcast status change via WebSocket
    broadcast('inbox:status_change', {
      inbox: {
        id: updated.id,
        customerHandle: updated.customerHandle || '',
        customerName: updated.customerName || undefined,
        content: updated.content || '',
        platform: updated.platform || '',
        priority: updated.priority || 'normal',
        status: updated.status,
      },
    });

    if (status === 'escalated') {
      broadcast('inbox:escalated', {
        inbox: {
          id: updated.id,
          customerHandle: updated.customerHandle || '',
          customerName: updated.customerName || undefined,
          content: updated.content || '',
          platform: updated.platform || '',
          priority: updated.priority || 'normal',
          status,
        },
      });
    }

    return { success: true, data: updated };
  });
};

export default inboxRoutes;
