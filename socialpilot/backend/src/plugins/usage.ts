import { FastifyInstance, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { usageEnforcer } from '../services/subscription/usage-enforcer';

export interface UsagePlugin {
  /** Check if user has capacity for a metric. Sets reply status 403 if exceeded. */
  checkLimit(metric: string): (request: FastifyRequest, reply: any) => Promise<void>;
  /** Record usage increment for a metric. */
  recordUsage(userId: string, metric: string, count?: number): Promise<void>;
  /** Get all usage stats for a user. */
  getAllUsage(userId: string): Promise<any>;
}

async function usagePlugin(fastify: FastifyInstance) {
  const decorator: UsagePlugin = {
    checkLimit: (metric: string) => {
      return async (request: FastifyRequest, reply: any) => {
        const { userId } = await (request as any).authenticate();

        const sub = await fastify.prisma.subscription.findUnique({ where: { userId } });
        const periodStart = sub?.currentPeriodStart || new Date(0);

        const check = await usageEnforcer.checkLimit(fastify.prisma, userId, metric, periodStart);

        if (!check.allowed) {
          return reply.status(403).send({
            success: false,
            error: check.error || 'Usage limit exceeded',
            data: {
              metric: check.metric,
              usage: check.usage,
              limit: check.limit,
              percentage: check.percentage,
            },
          });
        }
      };
    },

    recordUsage: async (userId: string, metric: string, count: number = 1) => {
      await usageEnforcer.recordUsage(fastify.prisma, userId, metric, count);
    },

    getAllUsage: async (userId: string) => {
      return usageEnforcer.getAllUsage(fastify.prisma, userId);
    },
  };

  fastify.decorate('usage', decorator);
}

declare module 'fastify' {
  interface FastifyInstance {
    usage: UsagePlugin;
  }
}

export default fp(usagePlugin, {
  name: 'usage',
  dependencies: ['prisma', 'auth'],
});
