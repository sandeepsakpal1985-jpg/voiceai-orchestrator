import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { subscriptionService, PLANS } from '../../services/subscription/subscription-service';
import { config } from '../../config';

const subscriptionRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', fastify.authenticate as any);

  // ── Get all available plans ──
  fastify.get('/plans', async () => {
    return {
      success: true,
      data: PLANS.map((p) => ({
        id: p.id,
        name: p.name,
        price: p.price,
        description: p.description,
        features: p.features,
        limits: p.limits,
        popular: p.popular,
      })),
    };
  });

  // ── Get current subscription with usage ──
  fastify.get('/current', async (request) => {
    const { userId } = await (request as any).authenticate();
    const subscription = await subscriptionService.getCurrentSubscription(
      fastify.prisma,
      userId,
    );
    return { success: true, data: subscription };
  });

  // ── Get usage stats with warnings ──
  fastify.get('/usage', async (request) => {
    const { userId } = await (request as any).authenticate();
    const usage = await subscriptionService.getDetailedUsage(fastify.prisma, userId);
    return { success: true, data: usage };
  });

  // ── Create order for subscription purchase ──
  fastify.post('/create-order', async (request, reply) => {
    const { userId } = await (request as any).authenticate();
    const schema = z.object({
      planId: z.enum(['starter', 'professional', 'agency']),
    });
    const { planId } = schema.parse(request.body);

    try {
      const result = await subscriptionService.createOrder(userId, planId);
      return { success: true, data: result };
    } catch (err: any) {
      if (err?.message?.includes('Razorpay not configured')) {
        return reply.status(503).send({
          success: false,
          error: 'Payment system is not configured. Please set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in your .env file, or contact support.',
        });
      }
      request.log.error('Order creation failed: %s', err?.message || err);
      return reply.status(500).send({
        success: false,
        error: 'Failed to create payment order. Please try again later.',
      });
    }
  });

  // ── Verify payment and activate subscription ──
  fastify.post('/verify', async (request, reply) => {
    const { userId } = await (request as any).authenticate();
    const schema = z.object({
      planId: z.enum(['starter', 'professional', 'agency']),
      razorpayOrderId: z.string(),
      razorpayPaymentId: z.string(),
      razorpaySignature: z.string(),
    });
    const body = schema.parse(request.body);

    // Verify signature
    const verification = subscriptionService.verifyPayment(
      body.razorpayOrderId,
      body.razorpayPaymentId,
      body.razorpaySignature,
    );

    if (!verification.valid) {
      return {
        success: false,
        error: 'Payment verification failed. Invalid signature.',
      };
    }

    // Activate subscription
    const subscription = await subscriptionService.activateSubscription(
      fastify.prisma,
      userId,
      body.planId,
      {
        orderId: body.razorpayOrderId,
        paymentId: body.razorpayPaymentId,
        signature: body.razorpaySignature,
      },
    );

    // Record usage reset
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    await fastify.prisma.usageRecord.create({
      data: {
        userId,
        metric: 'ai_responses',
        count: 0,
        date: periodStart,
      },
    });

    return {
      success: true,
      data: {
        subscription: {
          id: subscription.id,
          plan: subscription.plan,
          status: subscription.status,
          currentPeriodStart: subscription.currentPeriodStart,
          currentPeriodEnd: subscription.currentPeriodEnd,
        },
      },
    };
  });

  // ── Cancel subscription ──
  fastify.post('/cancel', async (request) => {
    const { userId } = await (request as any).authenticate();
    const result = await subscriptionService.cancelSubscription(
      fastify.prisma,
      userId,
    );
    return { success: true, data: { status: result.status, canceledAt: result.canceledAt } };
  });

  // ── Upgrade to a higher plan (creates order for the prorated difference) ──
  fastify.post('/upgrade', async (request) => {
    const { userId } = await (request as any).authenticate();
    const schema = z.object({
      planId: z.enum(['starter', 'professional', 'agency']),
    });
    const { planId } = schema.parse(request.body);

    // Get current subscription
    const currentSub = await fastify.prisma.subscription.findUnique({
      where: { userId },
    });

    const currentPlanId = currentSub?.plan || 'free';

    // Verify it's actually an upgrade
    const allPlans = ['free', 'starter', 'professional', 'agency'];
    const currentIdx = allPlans.indexOf(currentPlanId);
    const targetIdx = allPlans.indexOf(planId);

    if (targetIdx <= currentIdx) {
      return {
        success: false,
        error: 'Target plan must be higher than current plan. Use /downgrade to switch to a lower plan.',
      };
    }

    // Calculate prorated amount
    // If the user has an active subscription with time remaining, credit the unused portion
    // toward the new plan. This avoids charging them full price for the remainder of the period.
    let proratedAmount: number | undefined;
    let prorationDetails: { daysRemaining: number; totalDays: number; creditAmount: number; newPlanAmount: number; finalAmount: number } | undefined;

    if (currentSub && currentSub.currentPeriodStart && currentSub.currentPeriodEnd) {
      const periodStart = currentSub.currentPeriodStart.getTime();
      const periodEnd = currentSub.currentPeriodEnd.getTime();
      const now = Date.now();

      // Only prorate if there's meaningful time remaining (> 1 day)
      if (now < periodEnd && (periodEnd - now) > 24 * 60 * 60 * 1000) {
        const totalDays = (periodEnd - periodStart) / (24 * 60 * 60 * 1000);
        const daysRemaining = (periodEnd - now) / (24 * 60 * 60 * 1000);

        // Get plan prices
        const currentPlan = subscriptionService.getPlan(currentPlanId);
        const targetPlan = subscriptionService.getPlan(planId);

        if (currentPlan && targetPlan && currentPlan.price > 0) {
          const currentPlanMonthly = currentPlan.price * 100; // in paise
          const targetPlanMonthly = targetPlan.price * 100;   // in paise

          // Credit = remaining days / total days * current plan price
          const creditAmount = Math.round((daysRemaining / totalDays) * currentPlanMonthly);

          // New plan charge for remaining period = remaining days / total days * new plan price
          const newPlanCharge = Math.round((daysRemaining / totalDays) * targetPlanMonthly);

          // Final amount = new plan charge - credit (never below 0 — minimum 1 paise)
          const finalAmount = Math.max(1, newPlanCharge - creditAmount);

          proratedAmount = finalAmount;
          prorationDetails = {
            daysRemaining: Math.round(daysRemaining),
            totalDays: Math.round(totalDays),
            creditAmount,
            newPlanAmount: targetPlanMonthly,
            finalAmount,
          };
        }
      }
    }

    // Create an order — if prorated, pass the modified amount
    const result = await subscriptionService.createOrder(userId, planId, proratedAmount);
    return {
      success: true,
      data: {
        ...result,
        prorated: !!proratedAmount,
        prorationDetails,
      },
      upgradeFrom: currentPlanId,
      upgradeTo: planId,
    };
  });

  // ── Downgrade plan (immediate switch to lower-tier plan) ──
  fastify.post('/downgrade', async (request) => {
    const { userId } = await (request as any).authenticate();
    const schema = z.object({
      planId: z.enum(['free', 'starter', 'professional']),
    });
    const { planId } = schema.parse(request.body);

    // Get current subscription
    const currentSub = await fastify.prisma.subscription.findUnique({
      where: { userId },
    });

    const currentPlanId = currentSub?.plan || 'free';

    // Verify it's actually a downgrade
    const allPlans = ['free', 'starter', 'professional', 'agency'];
    const currentIdx = allPlans.indexOf(currentPlanId);
    const targetIdx = allPlans.indexOf(planId);

    if (targetIdx >= currentIdx) {
      return {
        success: false,
        error: 'Target plan must be lower than current plan. Use /upgrade to switch to a higher plan.',
      };
    }

    const targetPlan = subscriptionService.getPlan(planId)!;
    const now = new Date();

    const result = await fastify.prisma.subscription.upsert({
      where: { userId },
      update: {
        plan: planId,
        status: 'active',
        features: targetPlan.features,
        maxConnections: targetPlan.limits.connections,
        maxLeads: targetPlan.limits.leads,
        maxCrmDeals: targetPlan.limits.crmDeals,
        maxTeamMembers: targetPlan.limits.teamMembers,
        aiResponseLimit: targetPlan.limits.aiResponses,
        currentPeriodStart: now,
        currentPeriodEnd: null,
        canceledAt: null,
        gracePeriodEnd: null,
      },
      create: {
        userId,
        plan: planId,
        status: 'active',
        features: targetPlan.features,
        maxConnections: targetPlan.limits.connections,
        maxLeads: targetPlan.limits.leads,
        maxCrmDeals: targetPlan.limits.crmDeals,
        maxTeamMembers: targetPlan.limits.teamMembers,
        aiResponseLimit: targetPlan.limits.aiResponses,
        currentPeriodStart: now,
      },
    });

    return {
      success: true,
      data: {
        plan: result.plan,
        status: result.status,
        previousPlan: currentPlanId,
      },
    };
  });

  // ── Get billing history ──
  fastify.get('/billing-history', async (request) => {
    const { userId } = await (request as any).authenticate();
    const history = await subscriptionService.getBillingHistory(
      fastify.prisma,
      userId,
    );
    return { success: true, data: history };
  });

  // ── Download invoice / Get invoice details ──
  fastify.get('/invoice/:id', async (request) => {
    const { userId } = await (request as any).authenticate();
    const { id } = request.params as { id: string };

    const invoice = await fastify.prisma.invoice.findFirst({
      where: { id, userId },
    });

    if (!invoice) {
      return { success: false, error: 'Invoice not found' };
    }

    // If no invoice URL stored, try to fetch it from Razorpay
    let invoiceUrl = invoice.invoiceUrl;
    if (!invoiceUrl && invoice.razorpayPaymentId && config.razorpay.keyId) {
      try {
        invoiceUrl = await subscriptionService.fetchInvoiceUrl(
          invoice.razorpayPaymentId,
        );
        // Cache it for future requests
        if (invoiceUrl) {
          await fastify.prisma.invoice.update({
            where: { id: invoice.id },
            data: { invoiceUrl },
          });
        }
      } catch {
        // Silently fall back to dashboard link
      }
    }

    return {
      success: true,
      data: {
        id: invoice.id,
        amount: invoice.amount,
        currency: invoice.currency,
        status: invoice.status,
        plan: invoice.plan,
        paidAt: invoice.paidAt?.toISOString() || null,
        invoiceUrl: invoiceUrl || null,
        periodStart: invoice.periodStart?.toISOString() || null,
        periodEnd: invoice.periodEnd?.toISOString() || null,
      },
    };
  });

  // ── Razorpay Webhook (no auth — uses webhook secret) ──
  fastify.post('/webhook', async (request, reply) => {
    const body: any = request.body;
    const signature = request.headers['x-razorpay-signature'] as string;

    // Verify webhook signature
    if (config.razorpay.webhookSecret) {
      const crypto = await import('crypto');
      const expectedSignature = crypto
        .createHmac('sha256', config.razorpay.webhookSecret)
        .update(JSON.stringify(body))
        .digest('hex');

      if (expectedSignature !== signature) {
        return reply.code(401).send({ success: false, error: 'Invalid webhook signature' });
      }
    }

    const event = body.event;
    const payload = body.payload;

    try {
      await subscriptionService.handleWebhook(fastify.prisma, event, payload);
      return { success: true, received: true };
    } catch (error) {
      request.log.error(error, 'Webhook processing error');
      return { success: false, error: 'Webhook processing failed' };
    }
  });
};

export default subscriptionRoutes;
