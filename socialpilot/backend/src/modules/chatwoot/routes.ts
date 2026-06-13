import { FastifyPluginAsync } from 'fastify';
import { chatwootService } from '../../services/chatwoot/chatwoot-service';
import { broadcast } from '../../services/websocket/ws-store';

const chatwootRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', fastify.authenticate as any);

  // ── Configuration ──

  /** Get Chatwoot connection status */
  fastify.get('/status', async () => {
    const baseUrl = process.env.CHATWOOT_BASE_URL;
    const accountId = process.env.CHATWOOT_ACCOUNT_ID;
    const accessToken = process.env.CHATWOOT_ACCESS_TOKEN;

    const configured = !!(baseUrl && accountId && accessToken);

    return {
      success: true,
      data: {
        configured,
        baseUrl: baseUrl || null,
        accountId: accountId ? parseInt(accountId, 10) : null,
        hasToken: !!accessToken,
      },
    };
  });

  // ── Webhook Receiver ──

  /**
   * POST /api/chatwoot/webhook
   *
   * Receives Chatwoot webhook events and routes them to the appropriate
   * MetaPilot pipeline.
   *
   * Configure in Chatwoot: Settings → Integrations → Webhooks
   * URL: https://your-domain.com/api/chatwoot/webhook
   */
  fastify.post('/webhook', async (request, reply) => {
    // Chatwoot webhooks are authenticated via the configured URL in Chatwoot.
    // For additional security, optionally verify a shared secret token.
    const configuredToken = process.env.CHATWOOT_WEBHOOK_SECRET;
    if (configuredToken) {
      const receivedToken = (request.headers['x-chatwoot-signature'] as string) || '';
      if (receivedToken !== configuredToken) {
        return reply.status(401).send({ success: false, error: 'Invalid webhook signature' });
      }
    }

    const payload = chatwootService.parseWebhookPayload(request.body);
    if (!payload) {
      return reply.status(400).send({ success: false, error: 'Invalid webhook payload' });
    }

    // Webhooks don't carry JWT tokens — only authenticate if auth header is present
    let userId: string | null = null;
    if (request.headers.authorization) {
      const authResult = await (request as any).authenticate().catch(() => ({ userId: null as string | null }));
      userId = authResult.userId;
    }

    // Handle new customer messages
    if (chatwootService.isCustomerMessage(payload) && payload.message) {
      const conversationId = payload.conversation.id;
      const customerName = payload.conversation.meta.sender.name || 'Unknown';
      const content = payload.message.content;
      const platform = 'chatwoot';

      // Store as an inbox item for unified processing
      const inboxItem = await fastify.prisma.inboxItem.create({
        data: {
          userId: userId || 'system',
          platform,
          type: 'chatwoot_message',
          customerHandle: `chatwoot_${conversationId}`,
          customerName,
          content,
          status: 'unread',
          priority: 'normal',
          conversationId: String(conversationId),
        },
      });

      // Broadcast new inbox item via WebSocket
      broadcast('inbox:new', {
        inbox: {
          id: inboxItem.id,
          customerHandle: inboxItem.customerHandle || `chatwoot_${conversationId}`,
          customerName: inboxItem.customerName || customerName,
          content: inboxItem.content || content,
          platform: inboxItem.platform || platform,
          priority: inboxItem.priority || 'normal',
          status: inboxItem.status || 'unread',
        },
      });

      // Log the webhook for debugging
      fastify.log.info(
        `Chatwoot message from ${customerName} in conversation ${conversationId}: "${content.slice(0, 80)}..."`
      );
    }

    return { success: true, received: true };
  });

  // ── Manual Sync ──

  /** Sync a MetaPilot lead/conversation to Chatwoot */
  fastify.post('/sync/contact', async (request, reply) => {
    const { userId } = await (request as any).authenticate();

    const body = request.body as {
      name: string;
      email?: string;
      phone?: string;
      identifier?: string;
      customAttributes?: Record<string, unknown>;
    };

    if (!body.name) {
      return reply.status(400).send({ success: false, error: 'Name is required' });
    }

    try {
      const contact = await chatwootService.findOrCreateContact(body);
      return { success: true, data: contact };
    } catch (err: any) {
      return reply.status(502).send({
        success: false,
        error: `Chatwoot sync failed: ${err.message}`,
      });
    }
  });

  /** List Chatwoot conversations (pageable) */
  fastify.get('/conversations', async (request) => {
    const { userId } = await (request as any).authenticate();
    const q = request.query as { status?: string; page?: string };

    try {
      const result = await chatwootService.listConversations({
        status: q.status as any,
        page: q.page ? parseInt(q.page, 10) : undefined,
      });
      return { success: true, data: result.payload, meta: result.meta };
    } catch (err: any) {
      return { success: false, error: `Chatwoot fetch failed: ${err.message}` };
    }
  });

  /**
   * POST /api/chatwoot/sync
   * Bulk-import existing Chatwoot conversations as InboxItem records
   */
  fastify.post('/sync', async (request, reply) => {
    const { userId } = await (request as any).authenticate();

    try {
      const result = await chatwootService.listConversations();
      let imported = 0;

      for (const conv of result.payload) {
        // Check if already synced
        const existing = await fastify.prisma.inboxItem.findFirst({
          where: {
            userId,
            platform: 'chatwoot',
            conversationId: String(conv.id),
          },
        });
        if (existing) continue;

        const firstMessage = conv.messages?.[0];
        const customerName = firstMessage?.sender?.name || 'Chatwoot Contact';
        const content = firstMessage?.content || 'Conversation started';

        const newItem = await fastify.prisma.inboxItem.create({
          data: {
            userId,
            platform: 'chatwoot',
            type: 'chatwoot_message',
            customerHandle: `chatwoot_${conv.id}`,
            customerName,
            content,
            status: conv.status === 'resolved' ? 'resolved' : 'unread',
            priority: 'normal',
            conversationId: String(conv.id),
          },
        });

        broadcast('inbox:new', {
          inbox: {
            id: newItem.id,
            customerHandle: newItem.customerHandle || `chatwoot_${conv.id}`,
            customerName: newItem.customerName || customerName,
            content: newItem.content || content,
            platform: 'chatwoot',
            priority: 'normal',
            status: newItem.status || 'unread',
          },
        });
        imported++;
      }

      return { success: true, imported };
    } catch (err: any) {
      return reply.status(502).send({
        success: false,
        error: `Chatwoot sync failed: ${err.message}`,
      });
    }
  });

  /** Send a message to a Chatwoot conversation */
  fastify.post('/sync/message', async (request, reply) => {
    const { userId } = await (request as any).authenticate();

    const body = request.body as {
      conversationId: number;
      content: string;
    };

    if (!body.conversationId || !body.content) {
      return reply.status(400).send({ success: false, error: 'conversationId and content are required' });
    }

    try {
      const message = await chatwootService.sendMessage(body.conversationId, body.content);
      return { success: true, data: message };
    } catch (err: any) {
      return reply.status(502).send({
        success: false,
        error: `Chatwoot send failed: ${err.message}`,
      });
    }
  });
};

export default chatwootRoutes;
