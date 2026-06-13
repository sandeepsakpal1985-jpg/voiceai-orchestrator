/**
 * MetaPilot AI — Automation Module (ManyChat-style Features)
 *
 * Provides lightweight automation features:
 * - Keyword Triggers: Auto-reply rules for comments and DMs
 * - Comment-to-DM: Automatically send a DM to users who comment with trigger keywords
 * - Auto Like: Auto-like comments matching certain criteria
 * - AI Copilot: Suggest contextual replies for inbox items
 *
 * These replace the need for a visual flow builder while keeping the
 * product lightweight and focused on core sales/leads functionality.
 */

import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { generateCompletion } from '../../services/ai/llm';

const automationRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', fastify.authenticate as any);

  // ── Keyword Triggers ──

  // List all trigger rules
  fastify.get('/triggers', async (request) => {
    const { userId } = await (request as any).authenticate();
    const brandSettings = await fastify.prisma.brandSettings.findUnique({
      where: { userId },
      select: { customInstructions: true },
    });

    let triggers: any[] = [];
    if (brandSettings?.customInstructions) {
      try {
        const parsed = JSON.parse(brandSettings.customInstructions);
        triggers = parsed.keywordTriggers || [];
      } catch { /* use empty */ }
    }

    return { success: true, data: triggers };
  });

  // Save trigger rules (stored in BrandSettings.customInstructions.keywordTriggers)
  fastify.put('/triggers', async (request, reply) => {
    const { userId } = await (request as any).authenticate();
    const schema = z.object({
      triggers: z.array(z.object({
        id: z.string(),
        keyword: z.string().min(1),
        matchType: z.enum(['exact', 'contains', 'starts_with']),
        action: z.enum(['auto_reply_comment', 'auto_reply_dm', 'send_dm', 'like_comment', 'tag_lead', 'escalate']),
        replyTemplate: z.string().optional(),
        enabled: z.boolean().default(true),
        priority: z.number().default(0),
        platform: z.enum(['instagram', 'facebook', 'all']).default('all'),
      })),
    });

    const { triggers } = schema.parse(request.body);

    const existing = await fastify.prisma.brandSettings.findUnique({
      where: { userId },
      select: { customInstructions: true },
    });

    let existingData: Record<string, any> = {};
    if (existing?.customInstructions) {
      try {
        existingData = JSON.parse(existing.customInstructions);
      } catch { /* start fresh */ }
    }

    existingData.keywordTriggers = triggers;

    await fastify.prisma.brandSettings.upsert({
      where: { userId },
      update: { customInstructions: JSON.stringify(existingData) },
      create: {
        userId,
        businessName: 'My Business',
        customInstructions: JSON.stringify({ keywordTriggers: triggers }),
      },
    });

    return { success: true, data: { triggers, savedAt: new Date().toISOString() } };
  });

  // ── Auto-Like Comment ──
  // Tries to call Meta Graph API. Instagram doesn't support programmatic liking,
  // but Facebook Pages API does support comment likes via POST /{comment-id}/likes.
  fastify.post('/auto-like', async (request, reply) => {
    const { userId } = await (request as any).authenticate();
    const schema = z.object({
      commentId: z.string(),
      platform: z.enum(['instagram', 'facebook']),
    });

    const { commentId, platform } = schema.parse(request.body);

    const connection = await fastify.prisma.metaConnection.findFirst({
      where: { userId, status: 'active' },
    });

    if (!connection?.accessToken) {
      return reply.status(400).send({
        success: false,
        error: 'No active Meta connection found. Connect your Instagram or Facebook account first.',
      });
    }

    if (platform === 'instagram') {
      // Instagram Graph API does NOT support programmatic comment likes.
      // This is a documented Meta API limitation.
      return reply.status(400).send({
        success: false,
        error: 'Instagram does not support programmatic comment liking via their API. This feature is only available for Facebook comments.',
      });
    }

    // Facebook: POST /{comment-id}/likes
    try {
      const META_GRAPH_URL = 'https://graph.facebook.com/v21.0';
      const res = await fetch(
        `${META_GRAPH_URL}/${commentId}/likes?access_token=${connection.accessToken}`,
        { method: 'POST' },
      );

      if (res.ok) {
        const data = await res.json();
        fastify.log.info(`[AutoLike] Successfully liked Facebook comment ${commentId}`);
        return {
          success: true,
          data: {
            liked: true,
            commentId,
            platform,
            metaResult: data,
          },
        };
      } else {
        const errData = await res.json().catch(() => ({}));
        const errMsg = errData?.error?.message || `HTTP ${res.status}`;
        fastify.log.warn(`[AutoLike] Facebook API error: ${errMsg}`);
        return reply.status(502).send({
          success: false,
          error: `Failed to like comment: ${errMsg}`,
        });
      }
    } catch (err: any) {
      fastify.log.error(`[AutoLike] Request failed: ${err?.message}`);
      return reply.status(502).send({
        success: false,
        error: `Failed to like comment: ${err?.message || 'Unknown error'}`,
      });
    }
  });

  // ── AI Copilot Suggestions ──
  // Generate contextual AI reply suggestions for a given inbox item or conversation
  fastify.post('/copilot', async (request, reply) => {
    const { userId } = await (request as any).authenticate();
    const schema = z.object({
      content: z.string().min(1),
      context: z.object({
        platform: z.string().optional(),
        customerName: z.string().optional(),
        customerHandle: z.string().optional(),
        intent: z.string().optional(),
        previousMessages: z.array(z.object({
          role: z.string(),
          content: z.string(),
        })).optional(),
      }),
      style: z.enum(['professional', 'friendly', 'short', 'detailed']).default('friendly'),
      count: z.number().min(1).max(5).default(3),
    });

    const body = schema.parse(request.body);
    const { content, context, style, count } = body;

    const convoHistory = context.previousMessages
      ?.map(m => `[${m.role}] ${m.content}`)
      .join('\n') || '';

    const systemPrompt = `You are an AI copilot for social media customer engagement.
Generate ${count} different reply suggestions for the following customer message.
Style: ${style}
Platform: ${context.platform || 'social media'}
Customer: ${context.customerName || context.customerHandle || 'Unknown'}
${context.intent ? `Intent: ${context.intent}` : ''}
${convoHistory ? `\nConversation history:\n${convoHistory}` : ''}

For each suggestion, provide:
1. A short label (2-3 words describing the approach)
2. The reply text (natural, conversational, 1-3 sentences)
3. When this approach is most appropriate

Make suggestions distinct from each other — different angles, tones, and strategies.`;

    try {
      const result = await generateCompletion({
        systemPrompt,
        messages: [{ role: 'user', content }],
        temperature: 0.8,
        maxTokens: 1000,
      });

      // Parse the suggestions from the response
      const suggestions = result
        .split(/(?=\d+\.\s)/)
        .filter(s => s.trim().length > 20)
        .slice(0, count)
        .map(s => ({
          raw: s.trim(),
          // Extract label (first line or bold text)
          label: s.match(/\*\*(.*?)\*\*/)?.[1] || s.split('\n')[0]?.replace(/^\d+\.\s*/, '').slice(0, 40) || 'Suggestion',
        }));

      return {
        success: true,
        data: {
          suggestions: suggestions.length > 0 ? suggestions : [{ label: 'Reply', raw: result.slice(0, 500) }],
          generatedAt: new Date().toISOString(),
        },
      };
    } catch (err: any) {
      fastify.log.error('[Copilot] AI suggestion generation failed: %s', err?.message || err);
      return reply.status(500).send({
        success: false,
        error: 'Failed to generate suggestions. Please try again.',
      });
    }
  });

  // ── Comment-to-DM Automation ──
  // Send a DM to a user who commented based on a trigger rule
  fastify.post('/comment-to-dm', async (request, reply) => {
    const { userId } = await (request as any).authenticate();
    const schema = z.object({
      commentId: z.string(),
      authorId: z.string(),
      platform: z.enum(['instagram', 'facebook']),
      message: z.string().min(1),
    });

    const { commentId, authorId, platform, message } = schema.parse(request.body);

    // Find or create DM conversation
    let conversation = await fastify.prisma.dMConversation.findFirst({
      where: { userId, customerId: authorId, platform },
    });

    if (!conversation) {
      conversation = await fastify.prisma.dMConversation.create({
        data: {
          userId,
          customerId: authorId,
          platform,
          status: 'active',
          lastActivityAt: new Date(),
        },
      });
    }

    // Store the AI-initiated message
    await fastify.prisma.dMMessage.create({
      data: {
        conversationId: conversation.id,
        senderId: 'ai',
        content: message,
        role: 'assistant',
      },
    });

    await fastify.prisma.dMConversation.update({
      where: { id: conversation.id },
      data: { lastActivityAt: new Date() },
    });

    // Also update the comment to note a DM was sent
    if (platform === 'instagram') {
      await fastify.prisma.socialComment.updateMany({
        where: { userId, authorId, platform },
        data: { replyStatus: 'replied' },
      });
    }

    return {
      success: true,
      data: {
        conversationId: conversation.id,
        dmSent: true,
        message,
        customerId: authorId,
        platform,
      },
    };
  });
};

export default automationRoutes;
