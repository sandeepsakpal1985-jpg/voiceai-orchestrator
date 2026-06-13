import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { captureEvent, Events } from '../../services/analytics/posthog';

const ctaRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', fastify.authenticate as any);

  // List CTAs
  fastify.get('/', async (request) => {
    const { userId } = await (request as any).authenticate();
    const ctas = await fastify.prisma.cTAConfig.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return { success: true, data: ctas };
  });

  // Create CTA
  fastify.post('/', async (request) => {
    const { userId } = await (request as any).authenticate();
    const schema = z.object({
      type: z.enum(['website', 'whatsapp', 'calendly', 'demo_booking', 'payment_link']),
      label: z.string().min(1),
      url: z.string().url(),
      isDefault: z.boolean().default(false),
      minLeadScore: z.number().optional(),
      afterMessages: z.number().optional(),
    });
    const body = schema.parse(request.body);

    if (body.isDefault) {
      await fastify.prisma.cTAConfig.updateMany({
        where: { userId, isDefault: true },
        data: { isDefault: false },
      });
    }

    const cta = await fastify.prisma.cTAConfig.create({
      data: { userId, ...body },
    });

    captureEvent(userId, Events.CTA_CREATED, {
      ctaType: body.type,
      isDefault: body.isDefault,
    });

    return { success: true, data: cta };
  });

  // Update CTA
  fastify.put('/:id', async (request, reply) => {
    const { userId } = await (request as any).authenticate();
    const { id } = request.params as { id: string };
    const schema = z.object({
      type: z.enum(['website', 'whatsapp', 'calendly', 'demo_booking', 'payment_link']).optional(),
      label: z.string().optional(),
      url: z.string().url().optional(),
      isDefault: z.boolean().optional(),
      minLeadScore: z.number().optional(),
      afterMessages: z.number().optional(),
    });
    const body = schema.parse(request.body);

    const cta = await fastify.prisma.cTAConfig.findFirst({ where: { id, userId } });
    if (!cta) return reply.status(404).send({ success: false, error: 'CTA not found' });

    if (body.isDefault) {
      await fastify.prisma.cTAConfig.updateMany({
        where: { userId, isDefault: true },
        data: { isDefault: false },
      });
    }

    const updated = await fastify.prisma.cTAConfig.update({ where: { id }, data: body });

    captureEvent(userId, Events.CTA_UPDATED, { ctaId: id, ctaType: updated.type });

    return { success: true, data: updated };
  });

  // Delete CTA
  fastify.delete('/:id', async (request, reply) => {
    const { userId } = await (request as any).authenticate();
    const { id } = request.params as { id: string };

    const cta = await fastify.prisma.cTAConfig.findFirst({ where: { id, userId } });
    if (!cta) return reply.status(404).send({ success: false, error: 'CTA not found' });

    await fastify.prisma.cTAConfig.delete({ where: { id } });

    captureEvent(userId, Events.CTA_DELETED, { ctaId: id });

    return { success: true, data: { deleted: true } };
  });
};

export default ctaRoutes;
