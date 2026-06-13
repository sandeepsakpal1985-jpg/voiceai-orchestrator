import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

const reengagementRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', fastify.authenticate as any);

  // Get re-engagement rules
  fastify.get('/rules', async (request) => {
    const { userId } = await (request as any).authenticate();
    let rules = await fastify.prisma.reEngagementRule.findUnique({ where: { userId } });
    if (!rules) {
      rules = await fastify.prisma.reEngagementRule.create({
        data: {
          userId,
          stages: [
            { delay: '24h', messageTemplate: "Hi {{name}}, we noticed you were interested in {{product}}. Want to continue our conversation?" },
            { delay: '3d', messageTemplate: "Hey {{name}}, just checking in! Any questions about {{product}}?" },
            { delay: '7d', messageTemplate: "Last chance {{name}}! We'd love to help you with {{product}}. Reply anytime." },
          ],
          onlyDormant: true,
          excludeCustomers: false,
        },
      });
    }
    return { success: true, data: rules };
  });

  // Update rules
  fastify.put('/rules', async (request) => {
    const { userId } = await (request as any).authenticate();
    const schema = z.object({
      enabled: z.boolean().optional(),
      stages: z.array(z.object({
        delay: z.enum(['24h', '3d', '7d']),
        messageTemplate: z.string(),
      })).optional(),
      conditions: z.object({
        minLeadScore: z.number().optional(),
        onlyDormant: z.boolean().optional(),
        excludeCustomers: z.boolean().optional(),
      }).optional(),
    });
    const body = schema.parse(request.body);
    
    const updateData: any = {};
    if (body.enabled !== undefined) updateData.enabled = body.enabled;
    if (body.stages) updateData.stages = body.stages;
    if (body.conditions) {
      if (body.conditions.minLeadScore !== undefined) updateData.minLeadScore = body.conditions.minLeadScore;
      if (body.conditions.onlyDormant !== undefined) updateData.onlyDormant = body.conditions.onlyDormant;
      if (body.conditions.excludeCustomers !== undefined) updateData.excludeCustomers = body.conditions.excludeCustomers;
    }
    
    const updated = await fastify.prisma.reEngagementRule.upsert({
      where: { userId },
      create: { userId, ...updateData, stages: body.stages || [{ delay: '24h', messageTemplate: '' }] },
      update: updateData,
    });
    return { success: true, data: updated };
  });

  // List dormant leads (candidates for re-engagement)
  fastify.get('/candidates', async (request) => {
    const { userId } = await (request as any).authenticate();
    
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    
    const candidates = await fastify.prisma.lead.findMany({
      where: {
        userId,
        lastContactAt: { lt: sevenDaysAgo },
        category: { in: ['warm', 'hot'] },
      },
      orderBy: { leadScore: 'desc' },
      take: 50,
    });
    
    return { success: true, data: candidates };
  });
};

export default reengagementRoutes;
