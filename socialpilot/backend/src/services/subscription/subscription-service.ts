import Razorpay from 'razorpay';
import crypto from 'crypto';
import { config } from '../../config';

// ── Plan Definitions ──

export interface PlanLimits {
  connections: number;
  leads: number;
  crmDeals: number;
  teamMembers: number;
  aiResponses: number;
}

export interface PlanDefinition {
  id: string;
  name: string;
  price: number; // in INR (not paise)
  description: string;
  features: string[];
  limits: PlanLimits;
  razorpayPlanId?: string;
  popular?: boolean;
}

export const PLANS: PlanDefinition[] = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    description: 'Try MetaPilot with basic features',
    features: [
      '1 Meta Account',
      '100 AI Replies / Month',
      '50 Leads / Month',
      'Basic Analytics',
      'Basic CRM',
    ],
    limits: {
      connections: 1,
      leads: 50,
      crmDeals: 25,
      teamMembers: 1,
      aiResponses: 100,
    },
  },
  {
    id: 'starter',
    name: 'Starter',
    price: 499,
    description: 'For small businesses getting started',
    features: [
      '1 Meta Account',
      '1,000 AI Replies / Month',
      '100 Leads / Month',
      'Basic Analytics',
      'Basic CRM',
    ],
    limits: {
      connections: 1,
      leads: 100,
      crmDeals: 50,
      teamMembers: 1,
      aiResponses: 1000,
    },
  },
  {
    id: 'professional',
    name: 'Professional',
    price: 1499,
    description: 'For growing businesses',
    features: [
      'Up to 5 Meta Accounts',
      '3,000 AI Replies / Month',
      'Unlimited Leads',
      'Advanced Analytics',
      'Revenue Attribution',
      'Reputation Monitoring',
      'Missed Opportunity Recovery',
    ],
    limits: {
      connections: 5,
      leads: 999999,
      crmDeals: 999999,
      teamMembers: 5,
      aiResponses: 3000,
    },
    popular: true,
  },
  {
    id: 'agency',
    name: 'Agency',
    price: 4999,
    description: 'For agencies and large teams',
    features: [
      'Unlimited Meta Accounts',
      'Unlimited AI Replies',
      'Unlimited Leads',
      'Team Management',
      'White Label Ready (future)',
      'Priority Support',
    ],
    limits: {
      connections: 999999,
      leads: 999999,
      crmDeals: 999999,
      teamMembers: 999999,
      aiResponses: 999999,
    },
  },
];

// ── Razorpay Client ──

let _razorpayInstance: Razorpay | null = null;

function getRazorpay(): Razorpay {
  if (!_razorpayInstance) {
    if (!config.razorpay.keyId || !config.razorpay.keySecret) {
      throw new Error('Razorpay not configured: RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be set');
    }
    _razorpayInstance = new Razorpay({
      key_id: config.razorpay.keyId,
      key_secret: config.razorpay.keySecret,
    });
  }
  return _razorpayInstance;
}

// ── Subscription Service ──

export interface CreateSubscriptionResult {
  orderId: string;
  amount: number;
  currency: string;
  keyId: string;
  planName: string;
}

export interface VerifyPaymentResult {
  valid: boolean;
  paymentId: string;
  orderId: string;
}

export interface BillingHistoryEntry {
  id: string;
  amount: number;
  currency: string;
  status: string;
  plan: string;
  paidAt: string | null;
  invoiceUrl: string | null;
}

function pct(used: number, limit: number): number {
  if (limit >= 999999) return 0;
  return Math.round((used / limit) * 100);
}

function warningLevel(used: number, limit: number): 'none' | 'warning_80' | 'warning_90' | 'exceeded' {
  if (limit >= 999999) return 'none';
  const p = used / limit;
  if (p >= 1) return 'exceeded';
  if (p >= 0.9) return 'warning_90';
  if (p >= 0.8) return 'warning_80';
  return 'none';
}

export const subscriptionService = {
  getPlan(planId: string): PlanDefinition | undefined {
    return PLANS.find((p) => p.id === planId);
  },

  /**
   * Create a Razorpay order for subscription purchase.
   * Uses orders API for one-time payments (easier to start with).
   * For recurring subscriptions, switch to Razorpay subscriptions API later.
   */
  async createOrder(
    userId: string,
    planId: string,
    proratedAmountPaise?: number, // Optional prorated amount in paise
  ): Promise<CreateSubscriptionResult> {
    const plan = this.getPlan(planId);
    if (!plan || plan.price === 0) {
      throw new Error(`Invalid or free plan: ${planId}`);
    }

    const razorpay = getRazorpay();
    const amountInPaise = proratedAmountPaise ?? Math.round(plan.price * 100); // INR to paise

    const order = await razorpay.orders.create({
      amount: amountInPaise,
      currency: 'INR',
      receipt: `sub_${userId}_${Date.now()}`,
      notes: {
        userId,
        planId,
        prorated: proratedAmountPaise ? 'true' : 'false',
        originalAmount: String(Math.round(plan.price * 100)),
      },
    });

    return {
      orderId: order.id,
      amount: Number(order.amount),
      currency: order.currency,
      keyId: config.razorpay.keyId,
      planName: plan.name,
    };
  },

  /**
   * Verify Razorpay payment signature.
   */
  verifyPayment(
    orderId: string,
    paymentId: string,
    signature: string,
  ): VerifyPaymentResult {
    const body = `${orderId}|${paymentId}`;
    const expectedSignature = crypto
      .createHmac('sha256', config.razorpay.keySecret)
      .update(body)
      .digest('hex');

    return {
      valid: expectedSignature === signature,
      paymentId,
      orderId,
    };
  },

  /**
   * Activate a subscription after successful payment.
   */
  async activateSubscription(
    prisma: any,
    userId: string,
    planId: string,
    paymentDetails: {
      orderId: string;
      paymentId: string;
      signature: string;
    },
  ) {
    const plan = this.getPlan(planId);
    if (!plan) throw new Error(`Invalid plan: ${planId}`);

    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1); // 30-day billing period

    // Upsert subscription
    const subscription = await (prisma.subscription as any).upsert({
      where: { userId },
      update: {
        plan: planId,
        status: 'active',
        features: plan.features,
        maxConnections: plan.limits.connections,
        maxLeads: plan.limits.leads,
        maxCrmDeals: plan.limits.crmDeals,
        maxTeamMembers: plan.limits.teamMembers,
        aiResponseLimit: plan.limits.aiResponses,
        razorpayOrderId: paymentDetails.orderId,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        canceledAt: null,
        gracePeriodEnd: null,
      },
      create: {
        userId,
        plan: planId,
        status: 'active',
        features: plan.features,
        maxConnections: plan.limits.connections,
        maxLeads: plan.limits.leads,
        maxCrmDeals: plan.limits.crmDeals,
        maxTeamMembers: plan.limits.teamMembers,
        aiResponseLimit: plan.limits.aiResponses,
        razorpayOrderId: paymentDetails.orderId,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
      },
    });

    // Record invoice
    await (prisma.invoice as any).create({
      data: {
        userId,
        subscriptionId: subscription.id,
        razorpayPaymentId: paymentDetails.paymentId,
        razorpayOrderId: paymentDetails.orderId,
        razorpaySignature: paymentDetails.signature,
        amount: plan.price * 100,
        currency: 'INR',
        status: 'paid',
        plan: planId,
        periodStart: now,
        periodEnd,
        paidAt: now,
      },
    });

    return subscription;
  },

  /**
   * Cancel a subscription.
   */
  async cancelSubscription(prisma: any, userId: string) {
    const sub = await (prisma.subscription as any).findUnique({
      where: { userId },
    });

    if (!sub) throw new Error('No active subscription found');

    // Downgrade to free at end of period
    const updated = await (prisma.subscription as any).update({
      where: { userId },
      data: {
        status: 'canceled',
        canceledAt: new Date(),
      },
    });

    return updated;
  },

  /**
   * Get current subscription with usage stats.
   */
  async getCurrentSubscription(prisma: any, userId: string) {
    const sub = await (prisma.subscription as any).findUnique({
      where: { userId },
    });

    if (!sub) {
      // Return free plan by default
      const freePlan = this.getPlan('free')!;
      return {
        plan: 'free',
        status: 'active',
        features: freePlan.features,
        maxConnections: freePlan.limits.connections,
        maxLeads: freePlan.limits.leads,
        maxCrmDeals: freePlan.limits.crmDeals,
        maxTeamMembers: freePlan.limits.teamMembers,
        aiResponseLimit: freePlan.limits.aiResponses,
        currentPeriodStart: new Date(),
        currentPeriodEnd: null,
        canceledAt: null,
        usage: {
          aiResponsesUsed: 0,
          leadsCaptured: 0,
          crmDeals: 0,
          metaConnections: 0,
          teamMembers: 0,
        },
      };
    }

    // Gather usage stats for the current period
    const periodStart = sub.currentPeriodStart || new Date(0);

    const [aiResponsesUsed, leadsCaptured, crmDeals, metaConnections, teamMembers] =
      await Promise.all([
        (prisma.usageRecord as any).aggregate({
          where: {
            userId,
            metric: 'ai_responses',
            date: { gte: periodStart },
          },
          _sum: { count: true },
        }),
        (prisma.usageRecord as any).aggregate({
          where: {
            userId,
            metric: 'leads_captured',
            date: { gte: periodStart },
          },
          _sum: { count: true },
        }),
        (prisma.cRMDeal as any).count({
          where: { userId },
        }),
        (prisma.metaConnection as any).count({
          where: { userId },
        }),
        (prisma.teamMember as any).count({
          where: { userId },
        }),
      ]);

    return {
      ...sub,
      usage: {
        aiResponsesUsed: aiResponsesUsed._sum?.count || 0,
        leadsCaptured: leadsCaptured._sum?.count || 0,
        crmDeals: crmDeals || 0,
        metaConnections: metaConnections || 0,
        teamMembers: teamMembers || 0,
      },
    };
  },

  /**
   * Fetch invoice download URL from Razorpay using a payment ID.
   */
  async fetchInvoiceUrl(paymentId: string): Promise<string | null> {
    try {
      const razorpay = getRazorpay();
      const payment = await razorpay.payments.fetch(paymentId);
      // Razorpay payments have an `invoice_id` if created via invoice
      // Otherwise, construct a dashboard link
      if (payment.invoice_id) {
        // Get the invoice details for the download URL
        const invoice = await razorpay.invoices.fetch(payment.invoice_id);
        return invoice.short_url || null;
      }
      // Fall back to Razorpay dashboard payment page
      return `https://dashboard.razorpay.com/app/payments/${paymentId}`;
    } catch {
      return null;
    }
  },

  /**
   * Get billing history for a user.
   */
  async getBillingHistory(prisma: any, userId: string): Promise<BillingHistoryEntry[]> {
    const invoices = await (prisma.invoice as any).findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return invoices.map((inv: any) => ({
      id: inv.id,
      amount: inv.amount,
      currency: inv.currency,
      status: inv.status,
      plan: inv.plan,
      paidAt: inv.paidAt?.toISOString() || null,
      invoiceUrl: inv.invoiceUrl || null,
    }));
  },

  /**
   * Get detailed usage with percentage and warning levels.
   */
  async getDetailedUsage(prisma: any, userId: string) {
    const sub = await (prisma.subscription as any).findUnique({ where: { userId } });
    const periodStart = sub?.currentPeriodStart || new Date(0);

    const [aiUsageAgg, leadsUsageAgg, connectionCount, teamCount, knowledgeCount, crmCount] =
      await Promise.all([
        (prisma.usageRecord as any).aggregate({
          where: { userId, metric: 'ai_responses', date: { gte: periodStart } },
          _sum: { count: true },
        }),
        (prisma.usageRecord as any).aggregate({
          where: { userId, metric: 'leads_captured', date: { gte: periodStart } },
          _sum: { count: true },
        }),
        (prisma.metaConnection as any).count({ where: { userId } }),
        (prisma.teamMember as any).count({ where: { userId } }),
        (prisma.knowledgeDocument as any).count({ where: { userId } }),
        (prisma.cRMDeal as any).count({ where: { userId } }),
      ]);

    const plan = sub ? {
      aiResponses: sub.aiResponseLimit,
      leads: sub.maxLeads,
      connections: sub.maxConnections,
      teamMembers: sub.maxTeamMembers,
      crmDeals: sub.maxCrmDeals,
    } : this.getPlan('free')!.limits;

    const aiUsed = aiUsageAgg._sum?.count || 0;
    const leadsUsed = leadsUsageAgg._sum?.count || 0;

    const metrics = [
      {
        key: 'ai_responses',
        label: 'AI Replies',
        used: aiUsed,
        limit: plan.aiResponses,
        percentage: pct(aiUsed, plan.aiResponses),
        warning: warningLevel(aiUsed, plan.aiResponses),
      },
      {
        key: 'leads',
        label: 'Leads',
        used: leadsUsed,
        limit: plan.leads,
        percentage: pct(leadsUsed, plan.leads),
        warning: warningLevel(leadsUsed, plan.leads),
      },
      {
        key: 'connections',
        label: 'Meta Accounts',
        used: connectionCount,
        limit: plan.connections,
        percentage: pct(connectionCount, plan.connections),
        warning: warningLevel(connectionCount, plan.connections),
      },
      {
        key: 'team_members',
        label: 'Team Members',
        used: teamCount,
        limit: plan.teamMembers,
        percentage: pct(teamCount, plan.teamMembers),
        warning: warningLevel(teamCount, plan.teamMembers),
      },
      {
        key: 'crm_deals',
        label: 'CRM Deals',
        used: crmCount,
        limit: plan.crmDeals,
        percentage: pct(crmCount, plan.crmDeals),
        warning: warningLevel(crmCount, plan.crmDeals),
      },
    ];

    return {
      plan: sub?.plan || 'free',
      periodStart: sub?.currentPeriodStart || new Date(),
      periodEnd: sub?.currentPeriodEnd,
      metrics,
      planName: this.getPlan(sub?.plan || 'free')?.name || 'Free',
    };
  },

  /**
   * Handle Razorpay webhook events.
   */
  async handleWebhook(
    prisma: any,
    event: string,
    payload: any,
  ): Promise<void> {
    switch (event) {
      case 'payment.captured': {
        const payment = payload.payment?.entity;
        if (!payment) break;

        const orderId = payment.order_id;

        // Find the subscription by order ID
        const sub = await (prisma.subscription as any).findFirst({
          where: { razorpayOrderId: orderId },
        });

        if (sub) {
          // Record invoice
          await (prisma.invoice as any).create({
            data: {
              userId: sub.userId,
              subscriptionId: sub.id,
              razorpayPaymentId: payment.id,
              razorpayOrderId: orderId,
              amount: payment.amount,
              currency: payment.currency,
              status: 'paid',
              plan: sub.plan,
              paidAt: new Date(),
            },
          });
        }
        break;
      }

      case 'payment.failed': {
        const failedPayment = payload.payment?.entity;
        if (!failedPayment) break;

        const failedOrderId = failedPayment.order_id;
        const failedSub = await (prisma.subscription as any).findFirst({
          where: { razorpayOrderId: failedOrderId },
        });

        if (failedSub) {
          // Set grace period (7 days)
          const graceEnd = new Date();
          graceEnd.setDate(graceEnd.getDate() + 7);

          await (prisma.subscription as any).update({
            where: { id: failedSub.id },
            data: {
              status: 'past_due',
              gracePeriodEnd: graceEnd,
            },
          });

          // Record failed invoice
          await (prisma.invoice as any).create({
            data: {
              userId: failedSub.userId,
              subscriptionId: failedSub.id,
              razorpayPaymentId: failedPayment.id,
              razorpayOrderId: failedOrderId,
              amount: failedPayment.amount || 0,
              currency: failedPayment.currency || 'INR',
              status: 'failed',
              plan: failedSub.plan,
            },
          });
        }
        break;
      }

      case 'subscription.charged': {
        // Handle recurring subscription payment success
        const subEntity = payload.subscription?.entity;
        if (!subEntity) break;

        const rzpSub = await (prisma.subscription as any).findFirst({
          where: { razorpaySubscriptionId: subEntity.id },
        });

        if (rzpSub) {
          const now = new Date();
          const periodEnd = new Date(now);
          periodEnd.setMonth(periodEnd.getMonth() + 1);

          await (prisma.subscription as any).update({
            where: { id: rzpSub.id },
            data: {
              status: 'active',
              currentPeriodStart: now,
              currentPeriodEnd: periodEnd,
              gracePeriodEnd: null,
            },
          });
        }
        break;
      }

      default:
        // Ignore unhandled events
        break;
    }
  },
};
