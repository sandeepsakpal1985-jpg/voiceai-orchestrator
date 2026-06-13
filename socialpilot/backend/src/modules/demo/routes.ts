import { FastifyPluginAsync } from 'fastify';
import bcrypt from 'bcryptjs';
import { generateDemoData } from '../../services/demo/demo-generator';

const demoRoutes: FastifyPluginAsync = async (fastify) => {
  // ── Login as Demo Account ──
  // No auth required — publicly accessible for demo purposes
  fastify.post('/login', async (request, reply) => {
    // Find or create the demo user
    const demoEmail = 'demo@elitedentalclinic.com';
    let user = await fastify.prisma.user.findUnique({ where: { email: demoEmail } });

    if (!user) {
      // Create demo user
      const passwordHash = await bcrypt.hash('demo1234', 12);
      user = await fastify.prisma.user.create({
        data: {
          email: demoEmail,
          name: 'Elite Dental Clinic',
          passwordHash,
          role: 'owner',
          onboardingStep: 'turn_on_automation',
          onboardingDone: true,
        },
      });

      // Generate full demo dataset
      await generateDemoData({ userId: user.id, prisma: fastify.prisma });
    }

    const token = fastify.jwt.sign({ id: user.id, email: user.email, demo: true });

    return {
      success: true,
      data: {
        demo: true,
        companyName: 'Elite Dental Clinic',
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          onboardingDone: user.onboardingDone,
        },
        token,
      },
    };
  });

  // ── Regenerate Demo Data ──
  fastify.post('/regenerate', {
    preHandler: [fastify.authenticate as any],
  }, async (request, reply) => {
    const { userId } = await (request as any).authenticate();
    await generateDemoData({ userId, prisma: fastify.prisma });
    return { success: true, data: { regenerated: true } };
  });

  // ── Check if current account is a demo ──
  fastify.get('/status', {
    preHandler: [fastify.authenticate as any],
  }, async (request) => {
    const { userId } = await (request as any).authenticate();
    const user = await fastify.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, name: true, createdAt: true },
    });
    const isDemo = user?.email === 'demo@elitedentalclinic.com';
    return {
      success: true,
      data: {
        demo: isDemo,
        companyName: isDemo ? 'Elite Dental Clinic' : null,
      },
    };
  });
};

export default demoRoutes;
