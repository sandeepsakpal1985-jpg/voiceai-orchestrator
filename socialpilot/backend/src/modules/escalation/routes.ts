import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { broadcast } from '../../services/websocket/ws-notify';

const escalationRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', fastify.authenticate as any);

  // List tickets
  fastify.get('/', async (request) => {
    const { userId } = await (request as any).authenticate();
    const q = request.query as { status?: string };
    const where: any = { userId };
    if (q.status) where.status = q.status;
    
    const tickets = await fastify.prisma.escalationTicket.findMany({
      where,
      orderBy: [{ severity: 'asc' }, { createdAt: 'desc' }],
    });
    return { success: true, data: tickets };
  });

  // Get ticket
  fastify.get('/:id', async (request, reply) => {
    const { userId } = await (request as any).authenticate();
    const { id } = request.params as { id: string };
    const ticket = await fastify.prisma.escalationTicket.findFirst({ where: { id, userId } });
    if (!ticket) return reply.status(404).send({ success: false, error: 'Ticket not found' });
    return { success: true, data: ticket };
  });

  // Update ticket
  fastify.put('/:id', async (request, reply) => {
    const { userId } = await (request as any).authenticate();
    const { id } = request.params as { id: string };
    const schema = z.object({
      status: z.enum(['open', 'in_progress', 'resolved']).optional(),
      assignedTo: z.string().optional(),
      resolution: z.string().optional(),
    });
    const body = schema.parse(request.body);
    
    const ticket = await fastify.prisma.escalationTicket.findFirst({ where: { id, userId } });
    if (!ticket) return reply.status(404).send({ success: false, error: 'Ticket not found' });
    
    const updateData: any = { ...body };
    if (body.status === 'resolved') updateData.resolvedAt = new Date();
    
    const updated = await fastify.prisma.escalationTicket.update({ where: { id }, data: updateData });

    broadcast('escalation:status_change', {
      escalation: {
        id: updated.id,
        title: updated.reason || undefined,
        severity: updated.severity || 'medium',
        status: updated.status,
        reason: updated.reason || undefined,
      },
    });

    return { success: true, data: updated };
  });
};

export default escalationRoutes;
