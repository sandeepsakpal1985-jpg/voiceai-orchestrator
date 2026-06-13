import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import crypto from 'crypto';

const webhookRoutes: FastifyPluginAsync = async (fastify) => {
  // ── Public webhook test endpoint (no auth) ──
  fastify.post('/test', async (request, reply) => {
    return { success: true, message: 'Webhook endpoint is reachable' };
  });

  // ── Authenticated routes ──
  fastify.addHook('preHandler', fastify.authenticate as any);

  // List webhook configs
  fastify.get('/', async (request) => {
    const { userId } = await (request as any).authenticate();
    const configs = await fastify.prisma.webhookConfig.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return { success: true, data: configs };
  });

  // Create webhook config
  fastify.post('/', async (request, reply) => {
    const { userId } = await (request as any).authenticate();
    const schema = z.object({
      name: z.string().min(1).max(100),
      url: z.string().url(),
      events: z.array(z.string()).min(1),
    });
    const { name, url, events } = schema.parse(request.body);

    // Generate a webhook secret for HMAC signing
    const secret = crypto.randomBytes(16).toString('hex');

    const config = await fastify.prisma.webhookConfig.create({
      data: { userId, name, url, events, secret },
    });

    return { success: true, data: config };
  });

  // Update webhook config
  fastify.put('/:id', async (request, reply) => {
    const { userId } = await (request as any).authenticate();
    const { id } = request.params as { id: string };
    const schema = z.object({
      name: z.string().min(1).max(100).optional(),
      url: z.string().url().optional(),
      events: z.array(z.string()).min(1).optional(),
      active: z.boolean().optional(),
    });
    const body = schema.parse(request.body);

    const config = await fastify.prisma.webhookConfig.findFirst({ where: { id, userId } });
    if (!config) return reply.status(404).send({ success: false, error: 'Webhook config not found' });

    const updated = await fastify.prisma.webhookConfig.update({ where: { id }, data: body });
    return { success: true, data: updated };
  });

  // Delete webhook config
  fastify.delete('/:id', async (request, reply) => {
    const { userId } = await (request as any).authenticate();
    const { id } = request.params as { id: string };

    const config = await fastify.prisma.webhookConfig.findFirst({ where: { id, userId } });
    if (!config) return reply.status(404).send({ success: false, error: 'Webhook config not found' });

    await fastify.prisma.webhookConfig.delete({ where: { id } });
    return { success: true, data: { deleted: true } };
  });
};

export default webhookRoutes;
