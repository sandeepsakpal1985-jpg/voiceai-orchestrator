import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { config } from './config';
import prismaPlugin from './plugins/prisma';
import authPlugin from './plugins/auth';
import usagePlugin from './plugins/usage';
import websocket from '@fastify/websocket';
import { initSentry, setupFastifyErrorHandler, captureException, flushSentry } from './services/sentry/sentry';
import { initPostHog, shutdownPostHog } from './services/analytics/posthog';
import { registerWsNotificationRoute, closeAllConnections } from './services/websocket/ws-notify';
import { initEventBus, closeEventBus } from './services/websocket/event-bus';
import { CronService } from './services/cron/cron-service';
import { validateEnv } from './config';

// Module routes
import authRoutes from './modules/auth/routes';
import metaRoutes from './modules/meta/routes';
import commentRoutes from './modules/comments/routes';
import dmRoutes from './modules/dms/routes';
import leadRoutes from './modules/leads/routes';
import crmRoutes from './modules/crm/routes';
import inboxRoutes from './modules/inbox/routes';
import analyticsRoutes from './modules/analytics/routes';
import knowledgeRoutes from './modules/knowledge/routes';
import escalationRoutes from './modules/escalation/routes';
import reengagementRoutes from './modules/reengagement/routes';
import onboardingRoutes from './modules/onboarding/routes';
import automationRoutes from './modules/automation/routes';
import contentRoutes from './modules/content/routes';
import ctaRoutes from './modules/cta/routes';
import teamRoutes from './modules/team/routes';
import notificationRoutes from './modules/notifications/routes';
import adminRoutes from './modules/admin/routes';
import settingsRoutes, { brandRoutes } from './modules/settings/routes';
import chatwootRoutes from './modules/chatwoot/routes';
import n8nRoutes from './modules/n8n/routes';
import missedOpportunityRoutes from './modules/missed-opportunities/routes';
import approvalRoutes from './modules/approvals/routes';
import revenueRoutes from './modules/revenue/routes';
import reputationRoutes from './modules/reputation/routes';
import timelineRoutes from './modules/timeline/routes';
import subscriptionRoutes from './modules/subscription/routes';
import demoRoutes from './modules/demo/routes';
import customerSuccessRoutes from './modules/customer-success/routes';
import apiKeyRoutes from './modules/api-keys/routes';
import webhookRoutes from './modules/webhooks/routes';
import activityRoutes from './modules/activity/routes';
import metaHealthRoutes from './modules/meta-health/routes';
import reportRoutes from './modules/reports/routes';
import partnerRoutes from './modules/partners/routes';
import metaInsightsRoutes from './modules/meta-insights/routes';

async function buildApp() {
  // Validate required environment variables
  validateEnv();

  // Initialize Sentry before anything else
  initSentry();

  // Initialize PostHog analytics
  initPostHog();

  // ── JWT_SECRET guard ──
  // In production, JWT_SECRET must be set. In dev, a warning is logged.
  if (!config.jwt.secret) {
    if (config.nodeEnv === 'production') {
      console.error('❌ JWT_SECRET is not set. Authentication will fail. Set a strong random secret in .env');
    } else {
      console.log('⚠️  JWT_SECRET not configured — dev mode: auth will skip token verification.');
    }
  }

  const app = Fastify({
    logger: {
      level: config.nodeEnv === 'production' ? 'info' : 'debug',
    },
  });

  // ── Plugins ──
  await app.register(cors, {
    origin: [config.frontendUrl],
    credentials: true,
  });

  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  });

  await app.register(jwt, {
    secret: config.jwt.secret,
  });

  await app.register(swagger, {
    openapi: {
      info: {
        title: 'MetaPilot AI API',
        description: 'AI Social Sales Agent — Instagram & Facebook Automation',
        version: '0.1.0',
      },
      servers: [{ url: `http://localhost:${config.port}` }],
    },
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs',
  });

  await app.register(prismaPlugin);
  await app.register(authPlugin);
  await app.register(usagePlugin);

  // ── WebSocket ──
  await app.register(websocket);

  // ── File Upload ──
  await app.register(multipart, {
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB
      files: 1,
    },
  });

  // ── Register Sentry error handler (after plugins, before routes) ──
  setupFastifyErrorHandler(app);

  // ── Health Check ──
  app.get('/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
  }));

  // ── API Routes ──
  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(metaRoutes, { prefix: '/api/meta' });
  await app.register(commentRoutes, { prefix: '/api/comments' });
  await app.register(dmRoutes, { prefix: '/api/dms' });
  await app.register(leadRoutes, { prefix: '/api/leads' });
  await app.register(crmRoutes, { prefix: '/api/crm' });
  await app.register(inboxRoutes, { prefix: '/api/inbox' });
  await app.register(analyticsRoutes, { prefix: '/api/analytics' });
  await app.register(knowledgeRoutes, { prefix: '/api/knowledge' });
  await app.register(escalationRoutes, { prefix: '/api/escalations' });
  await app.register(reengagementRoutes, { prefix: '/api/reengagement' });
  await app.register(onboardingRoutes, { prefix: '/api/onboarding' });
  await app.register(ctaRoutes, { prefix: '/api/cta' });
  await app.register(teamRoutes, { prefix: '/api/team' });
  await app.register(notificationRoutes, { prefix: '/api/notifications' });
  await app.register(adminRoutes, { prefix: '/api/admin' });
  await app.register(settingsRoutes, { prefix: '/api/settings' });
  await app.register(brandRoutes, { prefix: '/api' });
  await app.register(chatwootRoutes, { prefix: '/api/chatwoot' });
  await app.register(n8nRoutes, { prefix: '/api/n8n' });
  await app.register(missedOpportunityRoutes, { prefix: '/api/missed-opportunities' });
  await app.register(approvalRoutes, { prefix: '/api/approvals' });
  await app.register(revenueRoutes, { prefix: '/api/revenue' });
  await app.register(reputationRoutes, { prefix: '/api/reputation' });
  await app.register(timelineRoutes, { prefix: '/api/timeline' });
  await app.register(subscriptionRoutes, { prefix: '/api/subscription' });
  await app.register(demoRoutes, { prefix: '/api/demo' });
  await app.register(customerSuccessRoutes, { prefix: '/api/customer-success' });
  await app.register(apiKeyRoutes, { prefix: '/api/api-keys' });
  await app.register(webhookRoutes, { prefix: '/api/webhooks' });
  await app.register(activityRoutes, { prefix: '/api/activity' });
  await app.register(metaHealthRoutes, { prefix: '/api/meta-health' });
  await app.register(reportRoutes, { prefix: '/api/reports' });
  await app.register(partnerRoutes, { prefix: '/api/partners' });
  await app.register(automationRoutes, { prefix: '/api/automation' });
  await app.register(contentRoutes, { prefix: '/api/content' });
  await app.register(metaInsightsRoutes, { prefix: '/api/meta-insights' });

  // ── WebSocket Notification Route ──
  registerWsNotificationRoute(app);

  // ── Redis Event Bus (bridges workers → WebSocket) ──
  initEventBus();

  // ── Cron Jobs (in-process scheduler) ──
  const cronService = new CronService(app.prisma as any);
  cronService.start();
  app.addHook('onClose', async () => {
    cronService.stop();
  });

  return app;
}

// ── Start ──
async function start() {
  const app = await buildApp();
  try {
    await app.listen({ port: config.port, host: '0.0.0.0' });
    app.log.info(`MetaPilot AI API running on port ${config.port}`);
  } catch (err) {
    app.log.error(err);
    captureException(err instanceof Error ? err : new Error(String(err)));
    await flushSentry();
    process.exit(1);
  }
}

start();

export { buildApp };

// ── Graceful shutdown ──
process.on('SIGTERM', async () => {
  closeAllConnections();
  await closeEventBus();
  await Promise.all([flushSentry(), shutdownPostHog()]);
  process.exit(0);
});

process.on('SIGINT', async () => {
  closeAllConnections();
  await closeEventBus();
  await Promise.all([flushSentry(), shutdownPostHog()]);
  process.exit(0);
});
