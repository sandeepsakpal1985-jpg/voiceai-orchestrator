/**
 * MetaPilot AI — Meta Webhook Processor
 *
 * Parses incoming Meta webhook events (comments, messages, mentions)
 * and routes them to the appropriate processing pipeline.
 *
 * Flow:
 *   Meta POST /webhook → WebhookProcessor.process() → Identify event type
 *     → Comment → Create SocialComment record → Queue comment job
 *     → DM Message → Create/Update DMConversation → Queue DM job
 *     → Unknown → Store raw for later analysis
 */

import { PrismaClient, Prisma } from '@prisma/client';
import type { MetaWebhookEvent } from '@socialpilot/shared';
import { addCommentJob, addDMJob } from '../queue/queue-service';
import { sendEmail, wrapEmailTemplate } from '../email/email-service';

type ProcessorResult = {
  processed: number;
  comments: number;
  dms: number;
  mentions: number;
  errors: number;
};

/** Internal event type — separate from shared types because webhook parsing has different field semantics */
type CommentEvent = {
  type: 'comment';
  platform: 'instagram' | 'facebook';
  pageId: string;
  postId: string;
  commentId: string;
  authorId: string;
  authorName?: string;
  content: string;
  mediaUrls?: string[];
  timestamp: string;
};

type DMEvent = {
  type: 'dm';
  platform: 'instagram' | 'messenger';
  pageId: string;
  senderId: string;
  recipientId: string;
  content: string;
  mediaUrls?: string[];
  timestamp: string;
};

type WebhookEvent = CommentEvent | DMEvent;

export class MetaWebhookProcessor {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Process a raw Meta webhook payload.
   * Parses entries, identifies event types, creates records, and queues jobs.
   */
  async process(body: MetaWebhookEvent): Promise<ProcessorResult> {
    const result: ProcessorResult = {
      processed: 0,
      comments: 0,
      dms: 0,
      mentions: 0,
      errors: 0,
    };

    if (!body?.entry?.length) {
      return result;
    }

    const MAX_WEBHOOK_AGE_MS = 5 * 60 * 1000; // 5 minutes

    for (const entry of body.entry) {
      try {
        // ── Replay attack protection ──
        // Reject webhook entries older than 5 minutes to prevent replay attacks.
        if (entry.time) {
          const age = Date.now() - (entry.time * 1000);
          if (age > MAX_WEBHOOK_AGE_MS || age < -60000) {
            console.warn(
              `[WebhookProcessor] Rejecting entry with invalid timestamp (age=${Math.round(age / 1000)}s): ${entry.id}`,
            );
            result.errors++;
            continue;
          }
        }

        // Store raw webhook for audit trail
        const webhook = await this.prisma.metaWebhook.create({
          data: {
            userId: 'pending',
            eventType: body.object || 'unknown',
            rawPayload: entry as Prisma.InputJsonValue,
          },
        });

        // Log retry attempts (Meta sends 'attempt' in the body for retries)
        const bodyAny = body as any;
        if (bodyAny.attempt && bodyAny.attempt > 1) {
          console.log(`[WebhookProcessor] Processing retry attempt ${bodyAny.attempt} for entry ${entry.id}`);
        }

        // Parse changes (comments, mentions, etc.)
        if (entry.changes) {
          for (const change of entry.changes) {
            const event = await this.parseChange(change.field, change.value, entry.id);
            if (event) {
              await this.routeEvent(event, webhook.id);
              result.processed++;
              if (change.field === 'comments') result.comments++;
              if (change.field === 'mentions') result.mentions++;
            }
          }
        }

        // Parse messaging events (DMs)
        if (entry.messaging) {
          for (const msg of entry.messaging) {
            const event = await this.parseMessaging(msg, entry.id);
            if (event) {
              await this.routeEvent(event, webhook.id);
              result.processed++;
              result.dms++;
            }
          }
        }
      } catch (err) {
        console.error('[WebhookProcessor] Error processing entry:', err);
        result.errors++;

        // Track error count on the webhook record so Meta knows to retry
        try {
          await this.prisma.metaWebhook.updateMany({
            where: { userId: 'pending', eventType: body.object || 'unknown' },
            data: { error: (err as Error)?.message || 'Processing error' },
          });
        } catch { /* silent */ }
      }
    }

    return result;
  }

  /**
   * Parse a webhook change event (comments, mentions, etc.)
   */
  private async parseChange(
    field: string,
    value: Record<string, unknown>,
    pageId: string,
  ): Promise<CommentEvent | null> {
    switch (field) {
      case 'comments': {
        const commentId = value.id as string;
        const postId = value.post_id as string;
        const text = ((value.text as string) || (value.message as string) || '').trim();
        const authorId = (((value as Record<string, unknown>).from as Record<string, unknown>)?.id as string) || commentId;
        const authorName = ((value as Record<string, unknown>).from as Record<string, unknown>)?.name as string || 'Unknown';

        if (!text && !commentId) return null;

        return {
          type: 'comment',
          platform: await this.resolvePlatform(pageId),
          pageId,
          postId: postId || '',
          commentId: commentId || '',
          authorId,
          authorName,
          content: text,
          mediaUrls: value.media ? [value.media as string] : undefined,
          timestamp: new Date().toISOString(),
        };
      }

      case 'mentions': {
        const mentionId = (value.mentioned_comment_id as string) || (value.id as string) || '';
        const text = ((value.text as string) || '').trim();
        const fromObj = (value as Record<string, unknown>).from as Record<string, unknown> | undefined;
        const authorId = (fromObj?.id as string) || mentionId;
        const authorName = (fromObj?.name as string) || 'Unknown';

        if (!text) return null;

        return {
          type: 'comment',
          platform: await this.resolvePlatform(pageId),
          pageId,
          postId: (value.post_id as string) || '',
          commentId: mentionId,
          authorId,
          authorName,
          content: text,
          timestamp: new Date().toISOString(),
        };
      }

      default:
        return null;
    }
  }

  /**
   * Parse a messaging event (Instagram DMs / Messenger)
   */
  private async parseMessaging(
    msg: Record<string, unknown>,
    pageId: string,
  ): Promise<DMEvent | null> {
    const sender = msg.sender as Record<string, unknown> | undefined;
    const recipient = msg.recipient as Record<string, unknown> | undefined;
    const message = msg.message as Record<string, unknown> | undefined;
    const timestamp = msg.timestamp as number | undefined;

    const senderId = sender?.id as string | undefined;
    const recipientId = recipient?.id as string | undefined;

    if (!senderId || !message) return null;

    const text = ((message.text as string) || '').trim();
    const attachments = message.attachments as Record<string, unknown>[] | undefined;
    const mediaUrls = attachments?.map((a) => (a.payload as Record<string, unknown>)?.url as string).filter(Boolean);

    if (!text && !mediaUrls?.length) return null;

    const platform: 'instagram' | 'messenger' = pageId === recipientId ? 'instagram' : 'messenger';

    return {
      type: 'dm',
      platform,
      pageId,
      senderId,
      recipientId: recipientId || '',
      content: text,
      mediaUrls: mediaUrls?.length ? mediaUrls : undefined,
      timestamp: timestamp ? new Date(timestamp * 1000).toISOString() : new Date().toISOString(),
    };
  }

  /**
   * Route a parsed event to the correct pipeline.
   */
  private async routeEvent(event: WebhookEvent, webhookId: string): Promise<void> {
    const connection = await this.prisma.metaConnection.findFirst({
      where: {
        OR: [
          { facebookPageId: event.pageId },
          { instagramAccountId: event.pageId },
        ],
        status: 'active',
      },
    });

    if (!connection) {
      console.warn(`[WebhookProcessor] No active connection found for page ${event.pageId}`);
      await this.prisma.metaWebhook.update({
        where: { id: webhookId },
        data: { userId: 'unresolved' },
      });
      return;
    }

    await this.prisma.metaWebhook.update({
      where: { id: webhookId },
      data: { userId: connection.userId },
    });

    if (event.type === 'comment') {
      await this.handleComment(event, connection);
    } else {
      await this.handleDirectMessage(event, connection);
    }
  }

  /**
   * Detect if a comment triggers an escalation based on keywords and patterns.
   */
  private detectEscalation(content: string): { reason: string; severity: 'critical' | 'high' | 'medium'; alertReason?: string } | null {
    const patterns: Array<{ regex: RegExp; reason: string; severity: 'critical' | 'high' | 'medium'; alertReason?: string }> = [
      { regex: /\blawyer\b|\blegal\s+(action|notice|threat)\b|\bsue\b|\blawsuit\b|\blegal\s+complaint\b/i, reason: 'Legal threat detected', severity: 'critical', alertReason: 'legal' },
      { regex: /\bconsumer\s+(court|complaint|forum)\b|\bconsumer\s+rights\b|\b(cyber|crime)\s+complaint\b/i, reason: 'Consumer complaint', severity: 'high', alertReason: 'complaint' },
      { regex: /\brefund\s+(or\s+)?(I'll|I\s+will|going\s+to)\b|\bmoney\s+back\s+(or\s+)?(else|i'll)\b|\bchargeback\b|\bdispute\b/i, reason: 'Refund or chargeback threat', severity: 'high', alertReason: 'refund' },
      { regex: /\bpolic(?:e|ing)\s+complaint\b|\bcop\b|\bfile\s+(a\s+)?case\b|\bcriminal\s+complaint\b/i, reason: 'Police or legal authority complaint', severity: 'critical', alertReason: 'legal' },
      { regex: /\bnews\s+(channel|reporter|agency)\b|\bmedia\s+(outlet|coverage)\b|\bgonna\s+expose\b|\bpublic\s+(shame|exposure)\b/i, reason: 'Media complaint threat', severity: 'critical', alertReason: 'media' },
      { regex: /\bscam\b|\bfraud\b|\bcheating\b|\btricked\b|\bstolen\b|\blying\b|\bfake\b|\bfalse\s+advertising\b/i, reason: 'Fraud allegation', severity: 'high', alertReason: 'fraud' },
      { regex: /\bGDPR\b|\bdata\s+(breach|leak|privacy|protection)\b|\bpersonal\s+data\b|\bprivacy\s+violation\b|\bCCPA\b/i, reason: 'Data privacy complaint', severity: 'high', alertReason: 'privacy' },
      { regex: /\bharass(?:ing|ment)?\b|\babuse\b|\bthreat(en)?(?:ing)?\b|\b(?:cuss|swear|curse)\s+word\b/i, reason: 'Abusive or threatening message', severity: 'high', alertReason: 'abuse' },
    ];

    for (const pattern of patterns) {
      if (pattern.regex.test(content)) {
        return { reason: pattern.reason, severity: pattern.severity, alertReason: pattern.alertReason };
      }
    }

    return null;
  }

  /**
   * Send email notification for critical/high severity escalations.
   */
  private async sendEscalationEmail(
    userId: string,
    event: { content: string; platform: string; authorName?: string; authorId: string },
    escalation: { reason: string; severity: string; alertReason?: string },
  ): Promise<void> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, name: true },
      });
      if (!user?.email) return;

      const severityColor = escalation.severity === 'critical' ? '#dc2626' : escalation.severity === 'high' ? '#ea580c' : '#ca8a04';
      const alertIcon = escalation.severity === 'critical' ? '🚨' : escalation.severity === 'high' ? '⚠️' : '🔶';

      await sendEmail({
        to: user.email,
        subject: `${alertIcon} ${escalation.severity.toUpperCase()} Escalation: ${escalation.reason}`,
        html: wrapEmailTemplate(
          'Escalation Alert',
          `<div style="border-left: 4px solid ${severityColor}; padding-left: 16px; margin-bottom: 24px;">
            <p style="color: #374151; font-weight: 600; font-size: 16px; margin: 0 0 4px;">${escalation.reason}</p>
            <p style="color: #6b7280; font-size: 12px; margin: 0;">Severity: <strong style="color: ${severityColor};">${escalation.severity.toUpperCase()}</strong></p>
          </div>
          <table style="width: 100%; border-collapse: collapse; font-size: 14px; color: #4b5563;">
            <tr><td style="padding: 6px 0; color: #9ca3af; width: 100px;">Platform</td><td style="font-weight: 500;">${event.platform}</td></tr>
            <tr><td style="padding: 6px 0; color: #9ca3af;">Customer</td><td style="font-weight: 500;">${event.authorName || event.authorId}</td></tr>
            <tr><td style="padding: 6px 0; color: #9ca3af; vertical-align: top;">Message</td><td>${event.content.slice(0, 300)}${event.content.length > 300 ? '...' : ''}</td></tr>
          </table>
          <p style="text-align: center; margin: 32px 0;">
            <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/escalations" class="btn">View in Dashboard</a>
          </p>
          <p style="font-size: 12px; color: #9ca3af;">AI replies have been paused for this customer until the escalation is resolved.</p>`,
        ),
        fromName: 'MetaPilot AI Alerts',
        fromEmail: 'alerts@metapilot.ai',
      });

      console.log(`[WebhookProcessor] Escalation email sent to ${user.email}`);
    } catch (err) {
      console.error('[WebhookProcessor] Failed to send escalation email:', err);
    }
  }

  /**
   * Auto-create an escalation ticket, pause AI, and send email notification.
   */
  private async autoEscalate(
    userId: string,
    event: { type: string; platform: string; pageId: string; postId: string; commentId: string; authorId: string; authorName?: string; content: string; mediaUrls?: string[]; timestamp: string },
    escalation: { reason: string; severity: string; alertReason?: string },
  ): Promise<void> {
    const isDm = event.type === 'dm';
    try {
      await this.prisma.escalationTicket.create({
        data: {
          userId,
          customerId: event.authorId,
          reason: escalation.reason,
          severity: escalation.severity,
          context: `${isDm ? 'Message' : 'Comment'} from ${event.authorName || event.authorId}: ${event.content.slice(0, 500)}\nPlatform: ${event.platform}\n${isDm ? '' : `Post: ${event.postId}`}`,
          aiPaused: true,
          status: 'open',
          reputationAlert: escalation.severity === 'critical' || escalation.severity === 'high',
          alertReason: escalation.alertReason || null,
        },
      });
      console.log(`[WebhookProcessor] Auto-escalated: ${escalation.reason} (${escalation.severity}) — user ${userId}`);

      // Send email notification for critical and high severity escalations
      if (escalation.severity === 'critical' || escalation.severity === 'high') {
        await this.sendEscalationEmail(userId, event, escalation).catch(
          (e) => console.error('[WebhookProcessor] Escalation email failed:', e),
        );
      }
    } catch (err) {
      console.error('[WebhookProcessor] Failed to auto-escalate:', err);
    }
  }

  /**
   * Handle a comment event: store in DB, check for escalation, and queue for AI processing.
   */
  private async handleComment(event: CommentEvent, connection: Record<string, unknown>): Promise<void> {
    const escalation = this.detectEscalation(event.content);
    if (escalation) {
      await this.autoEscalate(connection.userId as string, event, escalation);
      await this.prisma.socialComment.create({
        data: {
          userId: connection.userId as string,
          platform: event.platform,
          postId: event.postId,
          authorId: event.authorId,
          authorName: event.authorName || 'Unknown',
          content: event.content,
          replyStatus: 'escalated',
          category: 'complaint',
          escalationScore: 100,
        },
      });
      console.log(`[WebhookProcessor] Comment auto-escalated — no AI reply queued for ${event.commentId}`);
      return;
    }

    const comment = await this.prisma.socialComment.create({
      data: {
        userId: connection.userId as string,
        platform: event.platform,
        postId: event.postId,
        authorId: event.authorId,
        authorName: event.authorName || 'Unknown',
        content: event.content,
        mediaUrls: event.mediaUrls || undefined,
        replyStatus: 'pending',
      },
    });

    const delayMs = 45000 + Math.floor(Math.random() * 45000);
    await addCommentJob({
      commentId: comment.id,
      userId: connection.userId as string,
      platform: event.platform,
      postId: event.postId,
      authorId: event.authorId,
      authorName: event.authorName,
      content: event.content,
    }, delayMs);

    console.log(`[WebhookProcessor] Queued comment ${comment.id} for processing in ${Math.round(delayMs / 1000)}s`);
  }

  /**
   * Handle a DM event: auto-escalate if threat detected, else store and queue for AI.
   */
  private async handleDirectMessage(event: DMEvent, connection: Record<string, unknown>): Promise<void> {
    const userId = connection.userId as string;

    const escalation = this.detectEscalation(event.content);
    if (escalation) {
      await this.autoEscalate(connection.userId as string, {
        type: 'dm',
        platform: event.platform,
        pageId: event.pageId,
        postId: '',
        commentId: '',
        authorId: event.senderId,
        authorName: undefined,
        content: event.content,
        mediaUrls: event.mediaUrls,
        timestamp: event.timestamp,
      }, escalation);
      console.log(`[WebhookProcessor] DM auto-escalated — no AI reply queued for ${event.senderId}`);
      return;
    }

    let conversation = await this.prisma.dMConversation.findFirst({
      where: { userId, customerId: event.senderId, platform: event.platform },
    });

    if (!conversation) {
      conversation = await this.prisma.dMConversation.create({
        data: { userId, customerId: event.senderId, platform: event.platform, status: 'active', lastActivityAt: new Date() },
      });
    } else {
      await this.prisma.dMConversation.update({
        where: { id: conversation.id },
        data: { lastActivityAt: new Date() },
      });
    }

    await this.prisma.dMMessage.create({
      data: { conversationId: conversation.id, senderId: event.senderId, content: event.content, mediaUrls: event.mediaUrls || undefined, role: 'user' },
    });

    await addDMJob({ conversationId: conversation.id, userId, platform: event.platform, senderId: event.senderId, content: event.content });

    console.log(`[WebhookProcessor] Queued DM ${conversation.id} for processing`);
  }

  /**
   * Resolve platform from page ID.
   */
  private async resolvePlatform(pageId: string): Promise<'instagram' | 'facebook'> {
    const connection = await this.prisma.metaConnection.findFirst({
      where: { OR: [{ facebookPageId: pageId }, { instagramAccountId: pageId }] },
      select: { instagramAccountId: true },
    });

    if (connection?.instagramAccountId) return 'instagram';
    return 'facebook';
  }
}
