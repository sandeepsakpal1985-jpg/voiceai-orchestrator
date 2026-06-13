import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

const notificationRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', fastify.authenticate as any);

  // List notifications
  fastify.get('/', async (request) => {
    const { userId } = await (request as any).authenticate();
    const q = request.query as { unreadOnly?: string };
    const where: any = { userId };
    if (q.unreadOnly === 'true') where.read = false;

    const notifications = await fastify.prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return { success: true, data: notifications };
  });

  // Get unread count
  fastify.get('/unread-count', async (request) => {
    const { userId } = await (request as any).authenticate();
    const count = await fastify.prisma.notification.count({
      where: { userId, read: false },
    });
    return { success: true, data: { count } };
  });

  // Mark as read
  fastify.put('/:id/read', async (request, reply) => {
    const { userId } = await (request as any).authenticate();
    const { id } = request.params as { id: string };

    const notif = await fastify.prisma.notification.findFirst({ where: { id, userId } });
    if (!notif) return reply.status(404).send({ success: false, error: 'Notification not found' });

    await fastify.prisma.notification.update({ where: { id }, data: { read: true } });
    return { success: true, data: { read: true } };
  });

  // Mark all as read
  fastify.put('/read-all', async (request) => {
    const { userId } = await (request as any).authenticate();
    await fastify.prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });
    return { success: true, data: { readAll: true } };
  });

  // Create notification (internal use)
  fastify.post('/', async (request) => {
    const { userId } = await (request as any).authenticate();
    const schema = z.object({
      type: z.string(),
      title: z.string().min(1),
      body: z.string(),
      link: z.string().optional(),
    });
    const body = schema.parse(request.body);

    const notification = await fastify.prisma.notification.create({
      data: {
        user: { connect: { id: userId } },
        ...body,
      },
    });
    return { success: true, data: notification };
  });
};

export default notificationRoutes;
