import { FastifyPluginAsync } from 'fastify';

const activityRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', fastify.authenticate as any);

  // Get activity feed
  fastify.get('/', async (request) => {
    const { userId } = await (request as any).authenticate();
    const activities = await fastify.prisma.activityLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return { success: true, data: activities };
  });
};

// Helper to log activities from anywhere
export async function logActivity(
  prisma: any,
  userId: string,
  actorId: string,
  action: string,
  resource: string,
  details?: Record<string, any>,
) {
  try {
    await prisma.activityLog.create({
      data: { userId, actorId, action, resource, details: details || {} },
    });
  } catch {
    // Silently fail — activity logging should never break the main flow
  }
}

export default activityRoutes;
