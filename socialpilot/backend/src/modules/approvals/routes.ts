/**
 * MetaPilot AI — Approval Routes
 *
 * Full approval workflow with Meta Graph API publishing:
 * 1. AI generates a draft reply → stored as ApprovalRequest (pending)
 * 2. Business owner approves/rejects with optional edits
 * 3. On approve: reply is posted to Instagram/Facebook via Meta Graph API
 * 4. The SocialComment.replyStatus is updated to 'replied'
 * 5. WebSocket broadcast notifies dashboard in real-time
 */

import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { broadcast } from '../../services/websocket/ws-notify';
import { config } from '../../config';

const META_API_VERSION = 'v21.0';
const META_GRAPH_URL = `https://graph.facebook.com/${META_API_VERSION}`;

/**
 * Post an approved comment reply to Instagram or Facebook via Meta Graph API.
 * Instagram: POST /{ig-comment-id}/replies
 * Facebook:  POST /{comment-id}/replies
 */
async function publishReplyToMeta(
  platform: string,
  commentId: string | null,
  customerHandle: string | null,
  content: string,
  accessToken: string,
): Promise<{ published: boolean; metaId?: string; error?: string }> {
  if (!commentId && !customerHandle) {
    return { published: false, error: 'No comment ID or customer handle to reply to' };
  }

  try {
    // Use comment ID if available, otherwise try customer handle
    const targetId = commentId || customerHandle;
    if (!targetId) return { published: false, error: 'No target ID' };

    // Instagram comments use the /{ig-comment-id}/replies endpoint
    // Facebook comments use the /{comment-id}/replies endpoint
    const endpoint = platform === 'instagram'
      ? `${META_GRAPH_URL}/${targetId}/replies`
      : `${META_GRAPH_URL}/${targetId}/replies`;

    const params = new URLSearchParams({
      access_token: accessToken,
      message: content,
    });

    const res = await fetch(endpoint, {
      method: 'POST',
      body: params,
      signal: AbortSignal.timeout(10000),
    });

    if (res.ok) {
      const data = await res.json() as any;
      return { published: true, metaId: data.id };
    }

    const errBody = await res.json().catch(() => ({})) as any;
    const errorMsg = errBody?.error?.message || `HTTP ${res.status}`;
    console.error(`[Approvals] Meta publish failed: ${errorMsg}`);
    return { published: false, error: errorMsg };
  } catch (err: any) {
    const errorMsg = err?.message || 'Request failed';
    console.error(`[Approvals] Meta publish error: ${errorMsg}`);
    return { published: false, error: errorMsg };
  }
}

/**
 * Find the comment associated with an approval and update it after publishing.
 */
async function updateCommentAfterApproval(
  prisma: any,
  userId: string,
  approval: any,
  replyContent: string,
  metaId?: string,
): Promise<void> {
  // Try to find the original comment by matching customer info
  if (approval.customerHandle) {
    // Look for a pending comment from this customer
    await prisma.socialComment.updateMany({
      where: {
        userId,
        authorId: approval.customerHandle,
        replyStatus: 'pending',
      },
      data: {
        replyStatus: 'replied',
        replyContent,
        repliedAt: new Date(),
      },
    });
  }

  // Also try matching by customerId if available
  if (approval.customerId && approval.customerId !== approval.customerHandle) {
    await prisma.socialComment.updateMany({
      where: {
        userId,
        authorId: approval.customerId,
        replyStatus: 'pending',
      },
      data: {
        replyStatus: 'replied',
        replyContent,
        repliedAt: new Date(),
      },
    });
  }

  // Update DM conversation if this was a DM reply
  if (approval.platform) {
    await prisma.dMConversation.updateMany({
      where: {
        userId,
        customerId: approval.customerHandle || approval.customerId || '',
        status: 'active',
      },
      data: {
        status: 'resolved',
        lastActivityAt: new Date(),
      },
    });
  }
}

const approvalRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', fastify.authenticate as any);

  // List approvals
  fastify.get('/', async (request) => {
    const { userId } = await (request as any).authenticate();
    const q = request.query as { status?: string; page?: string; limit?: string };
    const page = parseInt(q.page || '1');
    const limit = parseInt(q.limit || '20');

    const where: any = { userId };
    if (q.status) where.status = q.status;

    const [data, total] = await Promise.all([
      fastify.prisma.approvalRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      fastify.prisma.approvalRequest.count({ where }),
    ]);

    return { success: true, data, total, page, limit, totalPages: Math.ceil(total / limit) };
  });

  // Get single approval
  fastify.get('/:id', async (request, reply) => {
    const { userId } = await (request as any).authenticate();
    const { id } = request.params as { id: string };
    const approval = await fastify.prisma.approvalRequest.findFirst({ where: { id, userId } });
    if (!approval) return reply.status(404).send({ success: false, error: 'Not found' });
    return { success: true, data: approval };
  });

  // Approve a draft — publishes to Instagram/Facebook via Meta Graph API
  fastify.post('/:id/approve', async (request, reply) => {
    const { userId } = await (request as any).authenticate();
    const { id } = request.params as { id: string };
    const schema = z.object({
      reviewNote: z.string().optional(),
      editContent: z.string().optional(),
    });
    const body = schema.parse(request.body || {});

    const approval = await fastify.prisma.approvalRequest.findFirst({ where: { id, userId } });
    if (!approval) return reply.status(404).send({ success: false, error: 'Not found' });
    if (approval.status !== 'pending') return reply.status(400).send({ success: false, error: 'Already reviewed' });

    const finalContent = body.editContent || approval.draftContent;

    // Get Meta connection for publishing
    const connection = await fastify.prisma.metaConnection.findFirst({
      where: { userId, status: 'active' },
    });

    let publishResult: { published: boolean; metaId?: string; error?: string } = { published: false, error: 'No active Meta connection' };

    if (connection?.accessToken && approval.platform) {
      publishResult = await publishReplyToMeta(
        approval.platform,
        approval.commentId, // Use stored comment ID from the approval
        approval.customerHandle,
        finalContent,
        connection.accessToken,
      );
    }

    const updated = await fastify.prisma.approvalRequest.update({
      where: { id },
      data: {
        status: 'approved',
        reviewedBy: userId,
        reviewNote: body.reviewNote,
        draftContent: finalContent,
        reviewedAt: new Date(),
      },
    });

    // Update the original comment's reply status
    if (publishResult.published || !connection) {
      await updateCommentAfterApproval(fastify.prisma, userId, approval, finalContent, publishResult.metaId);
    }

    broadcast('approval:status_change', {
      approval: {
        id: updated.id,
        customerName: updated.customerName || undefined,
        platform: updated.platform || '',
        status: 'approved',
        confidenceScore: updated.confidenceScore || undefined,
      },
    });

    return {
      success: true,
      data: { ...updated, publishResult },
    };
  });

  // Reject a draft
  fastify.post('/:id/reject', async (request, reply) => {
    const { userId } = await (request as any).authenticate();
    const { id } = request.params as { id: string };
    const schema = z.object({
      reviewNote: z.string().optional(),
    });
    const body = schema.parse(request.body || {});

    const approval = await fastify.prisma.approvalRequest.findFirst({ where: { id, userId } });
    if (!approval) return reply.status(404).send({ success: false, error: 'Not found' });
    if (approval.status !== 'pending') return reply.status(400).send({ success: false, error: 'Already reviewed' });

    const updated = await fastify.prisma.approvalRequest.update({
      where: { id },
      data: {
        status: 'rejected',
        reviewedBy: userId,
        reviewNote: body.reviewNote,
        reviewedAt: new Date(),
      },
    });

    broadcast('approval:status_change', {
      approval: {
        id: updated.id,
        customerName: updated.customerName || undefined,
        platform: updated.platform || '',
        status: 'rejected',
        confidenceScore: updated.confidenceScore || undefined,
      },
    });

    return { success: true, data: updated };
  });

  // Edit & publish — publishes to Meta and updates comment status
  fastify.post('/:id/edit-publish', async (request, reply) => {
    const { userId } = await (request as any).authenticate();
    const { id } = request.params as { id: string };
    const schema = z.object({
      draftContent: z.string().min(1),
      reviewNote: z.string().optional(),
    });
    const body = schema.parse(request.body);

    const approval = await fastify.prisma.approvalRequest.findFirst({ where: { id, userId } });
    if (!approval) return reply.status(404).send({ success: false, error: 'Not found' });

    // Get Meta connection for publishing
    const connection = await fastify.prisma.metaConnection.findFirst({
      where: { userId, status: 'active' },
    });

    let publishResult: { published: boolean; metaId?: string; error?: string } = { published: false, error: 'No active Meta connection' };

    if (connection?.accessToken && approval.platform) {
      publishResult = await publishReplyToMeta(
        approval.platform,
        approval.commentId, // Use stored comment ID from the approval
        approval.customerHandle,
        body.draftContent,
        connection.accessToken,
      );
    }

    const updated = await fastify.prisma.approvalRequest.update({
      where: { id },
      data: {
        status: 'approved',
        draftContent: body.draftContent,
        reviewedBy: userId,
        reviewNote: body.reviewNote,
        reviewedAt: new Date(),
      },
    });

    // Update the original comment's reply status
    if (publishResult.published || !connection) {
      await updateCommentAfterApproval(fastify.prisma, userId, approval, body.draftContent, publishResult.metaId);
    }

    broadcast('approval:status_change', {
      approval: {
        id: updated.id,
        customerName: updated.customerName || undefined,
        platform: updated.platform || '',
        status: 'approved',
        confidenceScore: updated.confidenceScore || undefined,
      },
    });

    return {
      success: true,
      data: { ...updated, publishResult },
    };
  });

  // Approval stats
  fastify.get('/stats', async (request) => {
    const { userId } = await (request as any).authenticate();

    const [total, pending, approved, rejected] = await Promise.all([
      fastify.prisma.approvalRequest.count({ where: { userId } }),
      fastify.prisma.approvalRequest.count({ where: { userId, status: 'pending' } }),
      fastify.prisma.approvalRequest.count({ where: { userId, status: 'approved' } }),
      fastify.prisma.approvalRequest.count({ where: { userId, status: 'rejected' } }),
    ]);

    const totalReviewed = approved + rejected;
    return {
      success: true,
      data: {
        total,
        pending,
        approved,
        rejected,
        approvalRate: totalReviewed ? Math.round((approved / totalReviewed) * 100) : 0,
        rejectionRate: totalReviewed ? Math.round((rejected / totalReviewed) * 100) : 0,
      },
    };
  });
};

export default approvalRoutes;
