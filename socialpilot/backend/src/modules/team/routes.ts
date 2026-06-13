import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { usageEnforcer } from '../../services/subscription/usage-enforcer';
import { logActivity } from '../activity/routes';

const teamRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', fastify.authenticate as any);

  // List team members
  fastify.get('/', async (request) => {
    const { userId } = await (request as any).authenticate();
    const members = await fastify.prisma.teamMember.findMany({
      where: { userId },
      include: {
        member: { select: { id: true, name: true, email: true, avatar: true, role: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return { success: true, data: members };
  });

  // Invite team member
  fastify.post('/invite', async (request, reply) => {
    const { userId } = await (request as any).authenticate();
    const schema = z.object({
      email: z.string().email(),
      role: z.enum(['admin', 'sales_agent', 'support_agent']),
    });
    const { email, role } = schema.parse(request.body);

    const member = await fastify.prisma.user.findUnique({ where: { email } });
    if (!member) {
      return reply.status(404).send({ success: false, error: 'User not found. They need to register first.' });
    }
    if (member.id === userId) {
      return reply.status(400).send({ success: false, error: 'Cannot invite yourself' });
    }

    const existing = await fastify.prisma.teamMember.findUnique({
      where: { userId_memberId: { userId, memberId: member.id } },
    });
    if (existing) {
      return reply.status(409).send({ success: false, error: 'Member already invited' });
    }

    // Check team member limit
    const sub = await fastify.prisma.subscription.findUnique({ where: { userId } });
    const memberCount = await fastify.prisma.teamMember.count({ where: { userId } });
    const limit = sub?.maxTeamMembers || 1;
    if (memberCount >= limit && limit < 999999) {
      return reply.status(403).send({
        success: false,
        error: `Team member limit reached (${limit}). Upgrade your plan to add more members.`,
      });
    }

    const teamMember = await fastify.prisma.teamMember.create({
      data: { userId, memberId: member.id, role },
      include: {
        member: { select: { id: true, name: true, email: true, role: true } },
      },
    });

    await logActivity(fastify.prisma, userId, userId, 'invite', `Team member: ${email}`);
    return { success: true, data: teamMember };
  });

  // Update member role
  fastify.put('/:id', async (request, reply) => {
    const { userId } = await (request as any).authenticate();
    const { id } = request.params as { id: string };
    const schema = z.object({ role: z.enum(['admin', 'sales_agent', 'support_agent']) });
    const { role } = schema.parse(request.body);

    const member = await fastify.prisma.teamMember.findFirst({ where: { id, userId } });
    if (!member) return reply.status(404).send({ success: false, error: 'Member not found' });

    const updated = await fastify.prisma.teamMember.update({ where: { id }, data: { role } });
    await logActivity(fastify.prisma, userId, userId, 'update_role', `Role changed to ${role}`);
    return { success: true, data: updated };
  });

  // Remove member
  fastify.delete('/:id', async (request, reply) => {
    const { userId } = await (request as any).authenticate();
    const { id } = request.params as { id: string };

    const member = await fastify.prisma.teamMember.findFirst({ where: { id, userId } });
    if (!member) return reply.status(404).send({ success: false, error: 'Member not found' });

    await fastify.prisma.teamMember.delete({ where: { id } });
    await logActivity(fastify.prisma, userId, userId, 'remove', `Removed team member`);
    return { success: true, data: { deleted: true } };
  });
};

export default teamRoutes;
