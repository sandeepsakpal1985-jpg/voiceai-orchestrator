import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { configureN8n, isN8nConfigured, triggerWebhook } from '../../services/n8n/n8n-service';

const n8nRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', fastify.authenticate as any);

  // ── Status ──

  /** GET /api/n8n/status — Check n8n connection status */
  fastify.get('/status', async () => ({
    success: true,
    data: {
      configured: isN8nConfigured(),
      baseUrl: process.env.N8N_BASE_URL || null,
      hasApiKey: !!process.env.N8N_API_KEY,
    },
  }));

  // ── Configure ──

  /** PUT /api/n8n/config — Update n8n configuration at runtime */
  fastify.put('/config', async (request, reply) => {
    const schema = z.object({
      baseUrl: z.string().url().optional(),
      apiKey: z.string().optional(),
    });

    const body = schema.parse(request.body);

    if (body.baseUrl) {
      configureN8n({
        baseUrl: body.baseUrl,
        apiKey: body.apiKey || process.env.N8N_API_KEY,
      });
    } else if (body.apiKey) {
      // Re-configure with existing base URL but new API key
      const currentBaseUrl = process.env.N8N_BASE_URL;
      if (!currentBaseUrl) {
        return reply.status(400).send({
          success: false,
          error: 'N8N_BASE_URL must be set before configuring API key',
        });
      }
      configureN8n({ baseUrl: currentBaseUrl, apiKey: body.apiKey });
    }

    return {
      success: true,
      data: {
        configured: isN8nConfigured(),
      },
    };
  });

  // ── Test Webhook ──

  /** POST /api/n8n/test — Send a test payload to a webhook endpoint */
  fastify.post('/test', async (request, reply) => {
    const schema = z.object({
      webhookId: z.string().min(1),
      payload: z.record(z.unknown()).default({}),
    });

    const body = schema.parse(request.body);

    if (!isN8nConfigured()) {
      return reply.status(400).send({
        success: false,
        error: 'n8n is not configured. Set N8N_BASE_URL and optionally N8N_API_KEY.',
      });
    }

    const result = await triggerWebhook(body.webhookId, body.payload);

    if (!result.triggered) {
      return reply.status(502).send({
        success: false,
        error: result.error || `Webhook returned status ${result.status}`,
      });
    }

    return { success: true, data: result.data };
  });

  // ── Trigger Re-engagement ──

  /** POST /api/n8n/trigger/reengagement — Trigger the re-engagement workflow */
  fastify.post('/trigger/reengagement', async (request, reply) => {
    const schema = z.object({
      customerId: z.string(),
      stage: z.enum(['24h', '3d', '7d']),
      customerName: z.string(),
      leadScore: z.number(),
      product: z.string().optional(),
    });

    const { userId } = await (request as any).authenticate();
    const body = schema.parse(request.body);

    if (!isN8nConfigured()) {
      return reply.status(400).send({
        success: false,
        error: 'n8n is not configured. Set N8N_BASE_URL and optionally N8N_API_KEY.',
      });
    }

    const result = await triggerWebhook('socialpilot-reengagement', {
      event: 'reengagement',
      userId,
      timestamp: new Date().toISOString(),
      ...body,
    });

    if (!result.triggered) {
      return reply.status(502).send({
        success: false,
        error: result.error || `Webhook returned status ${result.status}`,
      });
    }

    return { success: true, data: result.data };
  });
};

export default n8nRoutes;
