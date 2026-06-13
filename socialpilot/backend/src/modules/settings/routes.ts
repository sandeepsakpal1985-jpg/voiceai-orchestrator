import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

// ── Public brand endpoint (no auth) — used by custom domains ──
const brandRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/brand', async (request, reply) => {
    const { domain } = request.query as { domain?: string };

    let brand = null;
    if (domain) {
      brand = await fastify.prisma.brandSettings.findFirst({
        where: { customDomain: domain },
        select: {
          businessName: true,
          logo: true,
          favicon: true,
          primaryColor: true,
          hideBranding: true,
          customCss: true,
        },
      });
    }

    return { success: true, data: brand };
  });
};

// ── Authenticated settings routes ──
const settingsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', fastify.authenticate as any);

  // Get settings
  fastify.get('/', async (request) => {
    const { userId } = await (request as any).authenticate();
    let settings = await fastify.prisma.brandSettings.findUnique({ where: { userId } });
    if (!settings) {
      settings = await fastify.prisma.brandSettings.create({
        data: { userId, businessName: '' },
      });
    }
    return { success: true, data: settings };
  });

  // Update settings
  fastify.put('/', async (request) => {
    const { userId } = await (request as any).authenticate();
    const schema = z.object({
      businessName: z.string().optional(),
      industry: z.string().nullable().optional(),
      website: z.string().nullable().optional(),
      toneInstructions: z.string().nullable().optional(),
      customInstructions: z.string().nullable().optional(),
      automationEnabled: z.boolean().optional(),
      approvalMode: z.boolean().optional(),
      approvalModeType: z.enum(['fully_automatic', 'approval_required', 'hybrid']).optional(),
      timezone: z.string().optional(),
      defaultPersonality: z.string().optional(),
      // White-label fields
      logo: z.string().nullable().optional(),
      favicon: z.string().nullable().optional(),
      primaryColor: z.string().optional(),
      customDomain: z.string().nullable().optional(),
      customCss: z.string().nullable().optional(),
      hideBranding: z.boolean().optional(),
    });
    const body = schema.parse(request.body);

    const existing = await fastify.prisma.brandSettings.findUnique({ where: { userId } });
    if (existing) {
      const updated = await fastify.prisma.brandSettings.update({
        where: { userId },
        data: body,
      });
      return { success: true, data: updated };
    }

    const created = await fastify.prisma.brandSettings.create({
      data: { userId, businessName: body.businessName || '', ...body },
    });
    return { success: true, data: created };
  });
};

export { settingsRoutes, brandRoutes };
export default settingsRoutes;
