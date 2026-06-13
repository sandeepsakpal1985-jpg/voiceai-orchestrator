import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import crypto from 'crypto';

const apiKeyRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', fastify.authenticate as any);

  // List API keys
  fastify.get('/', async (request) => {
    const { userId } = await (request as any).authenticate();
    const keys = await fastify.prisma.apiKey.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        prefix: true,
        scopes: true,
        lastUsedAt: true,
        expiresAt: true,
        active: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return { success: true, data: keys };
  });

  // Create API key
  fastify.post('/', async (request, reply) => {
    const { userId } = await (request as any).authenticate();
    const schema = z.object({
      name: z.string().min(1).max(100),
      scopes: z.array(z.string()).default([]),
      expiresAt: z.string().nullable().optional(),
    });
    const { name, scopes, expiresAt } = schema.parse(request.body);

    // Generate key: sp_ prefix + random bytes
    const rawKey = 'sp_' + crypto.randomBytes(32).toString('hex');
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const prefix = rawKey.substring(0, 12) + '...';

    const apiKey = await fastify.prisma.apiKey.create({
      data: {
        userId,
        name,
        keyHash,
        prefix,
        scopes,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      },
    });

    // Return the raw key only on creation
    return {
      success: true,
      data: {
        id: apiKey.id,
        name: apiKey.name,
        prefix: apiKey.prefix,
        scopes: apiKey.scopes,
        expiresAt: apiKey.expiresAt,
        active: apiKey.active,
        createdAt: apiKey.createdAt,
        rawKey, // Only shown once!
      },
    };
  });

  // Revoke API key
  fastify.delete('/:id', async (request, reply) => {
    const { userId } = await (request as any).authenticate();
    const { id } = request.params as { id: string };

    const key = await fastify.prisma.apiKey.findFirst({ where: { id, userId } });
    if (!key) return reply.status(404).send({ success: false, error: 'API key not found' });

    await fastify.prisma.apiKey.update({ where: { id }, data: { active: false } });
    return { success: true, data: { revoked: true } };
  });
};

export default apiKeyRoutes;
