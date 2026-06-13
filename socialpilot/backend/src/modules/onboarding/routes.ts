import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { captureEvent, Events } from '../../services/analytics/posthog';

const onboardingRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', fastify.authenticate as any);

  // ── Onboarding Health Score ──
  type HealthCheckItem = {
    key: string;
    label: string;
    description: string;
    passed: boolean;
    points: number;
    earned: number;
    actionLabel: string;
    actionLink: string;
  };

  async function computeHealthScore(userId: string): Promise<{
    score: number;
    total: number;
    items: HealthCheckItem[];
  }> {
    const [metaConnections, knowledgeDocs, ctaConfigs, brandSettings, webhookEntries] =
      await Promise.all([
        fastify.prisma.metaConnection.findMany({ where: { userId, status: 'active' } }),
        fastify.prisma.knowledgeDocument.findMany({ where: { userId }, select: { id: true, type: true, content: true, title: true } }),
        fastify.prisma.cTAConfig.findMany({ where: { userId } }),
        fastify.prisma.brandSettings.findUnique({ where: { userId } }),
        fastify.prisma.metaWebhook.findFirst({ where: { userId, processed: true } }),
      ]);

    const hasFaq = knowledgeDocs.some(d => d.type === 'faq');
    const hasMeaningfulContent = knowledgeDocs.some(d => d.content && d.content.length > 50 && d.content !== `File: ${d.title}`);
    const hasPersonality = !!brandSettings?.defaultPersonality && brandSettings.defaultPersonality !== 'friendly';
    const hasApprovalMode = !!brandSettings?.approvalModeType && brandSettings.approvalModeType !== 'fully_automatic';

    const checks: {
      key: string; label: string; description: string; passed: boolean;
      points: number; earned: number; actionLabel: string; actionLink: string;
    }[] = [
      {
        key: 'meta_connected', label: 'Meta Connected',
        description: 'Connect your Instagram or Facebook business account to start receiving messages.',
        passed: metaConnections.length > 0, points: 20, earned: metaConnections.length > 0 ? 20 : 0,
        actionLabel: 'Connect Meta', actionLink: '/onboarding',
      },
      {
        key: 'webhook_active', label: 'Webhook Active',
        description: 'Meta webhook must be receiving events for automated replies to work.',
        passed: !!webhookEntries, points: 15, earned: !!webhookEntries ? 15 : 0,
        actionLabel: 'Setup Webhook', actionLink: '/settings',
      },
      {
        key: 'faq_uploaded', label: 'FAQ Uploaded',
        description: 'Upload frequently asked questions so the AI can answer customer queries accurately.',
        passed: hasFaq, points: 15, earned: hasFaq ? 15 : 0,
        actionLabel: 'Upload FAQ', actionLink: '/knowledge',
      },
      {
        key: 'cta_configured', label: 'CTA Configured',
        description: 'Set up a call-to-action button in AI responses to drive leads and conversions.',
        passed: ctaConfigs.length > 0, points: 15, earned: ctaConfigs.length > 0 ? 15 : 0,
        actionLabel: 'Configure CTA', actionLink: '/settings',
      },
      {
        key: 'personality_selected', label: 'Personality Selected',
        description: 'Choose an AI personality that matches your brand voice and tone.',
        passed: hasPersonality, points: 15, earned: hasPersonality ? 15 : 0,
        actionLabel: 'Select Personality', actionLink: '/settings',
      },
      {
        key: 'approval_mode', label: 'Approval Mode Selected',
        description: 'Choose how AI replies are handled: fully automatic or require approval.',
        passed: hasApprovalMode, points: 10, earned: hasApprovalMode ? 10 : 0,
        actionLabel: 'Configure Approval', actionLink: '/settings',
      },
      {
        key: 'knowledge_base', label: 'Knowledge Base Added',
        description: 'Add documents to the knowledge base so the AI can provide informed responses.',
        passed: hasMeaningfulContent, points: 10, earned: hasMeaningfulContent ? 10 : 0,
        actionLabel: 'Add Documents', actionLink: '/knowledge',
      },
    ];

    const earned = checks.reduce((sum, c) => sum + c.earned, 0);
    const total = checks.reduce((sum, c) => sum + c.points, 0);

    return { score: Math.round((earned / total) * 100), total: earned, items: checks };
  }

  // Get onboarding health score
  fastify.get('/health-score', async (request) => {
    const { userId } = await (request as any).authenticate();
    const result = await computeHealthScore(userId);
    return { success: true, data: result };
  });

  // Get onboarding status
  fastify.get('/', async (request) => {
    const { userId } = await (request as any).authenticate();
    const user = await fastify.prisma.user.findUnique({
      where: { id: userId },
      select: { onboardingStep: true, onboardingDone: true },
    });
    return { success: true, data: user };
  });

  // Update onboarding step
  fastify.put('/step', async (request, reply) => {
    const { userId } = await (request as any).authenticate();
    const schema = z.object({
      step: z.enum([
        'create_account', 'connect_instagram', 'connect_facebook',
        'upload_faqs', 'add_cta', 'choose_personality', 'turn_on_automation',
      ]),
    });
    const { step } = schema.parse(request.body);
    
    const stepOrder = [
      'create_account', 'connect_instagram', 'connect_facebook',
      'upload_faqs', 'add_cta', 'choose_personality', 'turn_on_automation',
    ];
    const done = step === 'turn_on_automation';
    
    await fastify.prisma.user.update({
      where: { id: userId },
      data: { onboardingStep: step, onboardingDone: done },
    });

    // Track onboarding step
    captureEvent(userId, Events.ONBOARDING_STEP, {
      step,
      stepIndex: stepOrder.indexOf(step),
      isComplete: done,
    });
    
    return { success: true, data: { step, done } };
  });

  // Complete onboarding — saves personality, CTA, and marks onboarding as done
  fastify.post('/complete', async (request) => {
    const { userId } = await (request as any).authenticate();
    const schema = z.object({
      personality: z.string().optional(),
      ctaType: z.string().optional(),
      ctaUrl: z.string().optional(),
      ctaLabel: z.string().optional(),
    });
    const body = schema.parse(request.body);

    // Save brand settings with chosen personality
    if (body.personality) {
      const existing = await fastify.prisma.brandSettings.findUnique({
        where: { userId },
      });
      if (existing) {
        await fastify.prisma.brandSettings.update({
          where: { userId },
          data: { defaultPersonality: body.personality },
        });
      } else {
        await fastify.prisma.brandSettings.create({
          data: {
            userId,
            businessName: '',
            defaultPersonality: body.personality,
          },
        });
      }
    }

    // Save CTA config if provided
    if (body.ctaType && body.ctaUrl) {
      await fastify.prisma.cTAConfig.create({
        data: {
          userId,
          type: body.ctaType,
          url: body.ctaUrl,
          label: body.ctaLabel || body.ctaType,
          isDefault: true,
        },
      });
    }

    // Mark onboarding as complete
    await fastify.prisma.user.update({
      where: { id: userId },
      data: { onboardingStep: 'turn_on_automation', onboardingDone: true },
    });

    // Track onboarding completion
    captureEvent(userId, Events.ONBOARDING_COMPLETE, {
      personality: body.personality,
      ctaType: body.ctaType,
      hasCta: !!body.ctaUrl,
    });

    return { success: true, data: { done: true } };
  });
};

export default onboardingRoutes;
