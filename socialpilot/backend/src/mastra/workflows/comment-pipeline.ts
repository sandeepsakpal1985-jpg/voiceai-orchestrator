import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { classifyComment } from '../../services/ai/classifier';
import { generateCompletion } from '../../services/ai/llm';
import { buildSystemPrompt } from '../../services/ai/context-builder';
import { PrismaClient } from '@prisma/client';
import type { LeadCategory } from '@socialpilot/shared';

const prisma = new PrismaClient();

// ── Helper ──

function getLeadCategory(score: number): LeadCategory {
  if (score >= 80) return 'vip';
  if (score >= 60) return 'hot';
  if (score >= 40) return 'warm';
  return 'cold';
}

// ── Step 1: Classify the comment ──

const classifyStep = createStep({
  id: 'classify-comment',
  inputSchema: z.object({
    commentId: z.string(),
    userId: z.string(),
    platform: z.string(),
    authorId: z.string(),
    authorName: z.string(),
    content: z.string(),
  }),
  outputSchema: z.object({
    commentId: z.string(),
    userId: z.string(),
    platform: z.string(),
    authorId: z.string(),
    authorName: z.string(),
    content: z.string(),
    category: z.string(),
    sentiment: z.number(),
    leadScore: z.number(),
    urgencyScore: z.number(),
    escalationScore: z.number(),
  }),
  execute: async ({ inputData }) => {
    const classification = await classifyComment(inputData.content, inputData.authorName);
    return {
      ...inputData,
      category: classification.category,
      sentiment: classification.sentiment,
      leadScore: classification.leadScore,
      urgencyScore: classification.urgencyScore,
      escalationScore: classification.escalationScore,
    };
  },
});

// ── Step 2: Create lead from comment (if score > 50) ──

const leadStep = createStep({
  id: 'create-lead',
  inputSchema: z.object({
    commentId: z.string(),
    userId: z.string(),
    platform: z.string(),
    authorId: z.string(),
    authorName: z.string(),
    content: z.string(),
    category: z.string(),
    sentiment: z.number(),
    leadScore: z.number(),
    urgencyScore: z.number(),
    escalationScore: z.number(),
  }),
  outputSchema: z.object({
    leadId: z.string().nullable(),
    dealCreated: z.boolean(),
  }),
  execute: async ({ inputData }) => {
    if (inputData.leadScore < 50) {
      return { leadId: null, dealCreated: false };
    }

    try {
      const existingLead = await prisma.lead.findFirst({
        where: {
          userId: inputData.userId,
          socialHandle: inputData.authorId,
        },
      });

      if (existingLead) {
        await prisma.lead.update({
          where: { id: existingLead.id },
          data: {
            leadScore: Math.max(existingLead.leadScore, inputData.leadScore),
            sentiment: inputData.sentiment,
            lastContactAt: new Date(),
            tags: { push: [`${inputData.category}_comment`] },
          },
        });
        return { leadId: existingLead.id, dealCreated: false };
      }

      const tags: string[] = [];
      if (inputData.leadScore >= 80) tags.push('hot_lead');
      else if (inputData.leadScore >= 60) tags.push('warm_lead');
      else tags.push('cold_lead');
      tags.push(`${inputData.category}_comment`);

      const lead = await prisma.lead.create({
        data: {
          userId: inputData.userId,
          name: inputData.authorName || undefined,
          socialHandle: inputData.authorId,
          platform: inputData.platform,
          category: getLeadCategory(inputData.leadScore),
          leadScore: inputData.leadScore,
          sentiment: inputData.sentiment,
          source: 'comment',
          tags,
          lastContactAt: new Date(),
          conversationSummary: inputData.content.slice(0, 500),
          recommendedAction: inputData.leadScore >= 70 ? 'Send DM follow-up with CTA' : 'Monitor and engage',
        },
      });

      // Create CRM deal if score >= 70
      let dealCreated = false;
      if (inputData.leadScore >= 70) {
        await prisma.cRMDeal.create({
          data: {
            userId: inputData.userId,
            leadId: lead.id,
            title: `${inputData.authorName || inputData.authorId} - ${inputData.category.replace('_', ' ')}`,
            stage: 'new_lead',
            leadScore: inputData.leadScore,
            sentiment: inputData.sentiment,
            aiSummary: `Auto-created from ${inputData.platform} comment. ${inputData.content.slice(0, 200)}`,
            recommendedAction: 'Send DM to qualify lead further',
            notes: `Category: ${inputData.category}. Lead Score: ${inputData.leadScore}.`,
          },
        });
        dealCreated = true;
      }

      return { leadId: lead.id, dealCreated };
    } catch (err) {
      console.error('[CommentPipeline] Error creating lead:', err);
      return { leadId: null, dealCreated: false };
    }
  },
});

// ── Step 3: Generate AI reply ──

const replyStep = createStep({
  id: 'generate-reply',
  inputSchema: z.object({
    commentId: z.string(),
    userId: z.string(),
    platform: z.string(),
    authorId: z.string(),
    authorName: z.string(),
    content: z.string(),
    category: z.string(),
    sentiment: z.number(),
    leadScore: z.number(),
    urgencyScore: z.number(),
    escalationScore: z.number(),
    leadId: z.string().nullable(),
    dealCreated: z.boolean(),
  }),
  outputSchema: z.object({
    response: z.string(),
  }),
  execute: async ({ inputData }) => {
    // Fetch knowledge docs for context
    let knowledgeContext = '';
    try {
      const docs = await prisma.knowledgeDocument.findMany({
        where: { userId: inputData.userId },
        select: { title: true, content: true, type: true },
        take: 5,
      });
      if (docs.length > 0) {
        const brandContext = { businessName: 'Business', personality: 'friendly' };
        knowledgeContext = buildSystemPrompt(brandContext, 'friendly', { documents: docs });
      }
    } catch (err) {
      console.error(`[CommentPipeline] Failed to fetch knowledge:`, err);
    }

    const response = await generateCompletion({
      systemPrompt: `You are an AI social media assistant. Reply to this ${inputData.platform} comment.
Category: ${inputData.category}
Sentiment: ${inputData.sentiment}
Lead Score: ${inputData.leadScore}
Escalation Risk: ${inputData.escalationScore}

Rules:
- Be contextual and helpful — match the comment's tone
- If it's a sales inquiry (score > 50), include a subtle CTA
- If it's a complaint, be empathetic and offer to help via DM
- If it's spam, legal threat, or escalation risk > 80, flag for human review and DO NOT reply
- Keep response concise (1-3 sentences)
- Never share internal business information
${knowledgeContext ? `\nKnowledge context:\n${knowledgeContext.slice(0, 1000)}` : ''}`,
      messages: [{ role: 'user', content: inputData.content }],
      temperature: 0.7,
      maxTokens: 150,
    });

    return { response };
  },
});

// ── Step 4: Update comment in DB (with approval mode check) ──

const updateStep = createStep({
  id: 'update-comment',
  inputSchema: z.object({
    commentId: z.string(),
    userId: z.string(),
    platform: z.string(),
    authorId: z.string(),
    authorName: z.string(),
    content: z.string(),
    category: z.string(),
    sentiment: z.number(),
    leadScore: z.number(),
    urgencyScore: z.number(),
    escalationScore: z.number(),
    leadId: z.string().nullable(),
    dealCreated: z.boolean(),
    response: z.string(),
  }),
  outputSchema: z.object({
    updated: z.boolean(),
    replyStatus: z.string(),
    approvalId: z.string().nullable(),
  }),
  execute: async ({ inputData }) => {
    try {
      // Determine reply status based on escalation and approval mode
      let replyStatus: string;
      let approvalId: string | null = null;

      if (inputData.escalationScore >= 80) {
        replyStatus = 'escalated';
      } else {
        // Check user's approval mode setting
        let needsApproval = false;
        try {
          const brandSettings = await prisma.brandSettings.findUnique({
            where: { userId: inputData.userId },
            select: { approvalModeType: true },
          });
          const modeType = brandSettings?.approvalModeType || 'fully_automatic';
          needsApproval = modeType === 'approval_required' || modeType === 'hybrid';
        } catch {
          // If we can't fetch settings, default to queued (safe default)
        }

        if (needsApproval) {
          replyStatus = 'pending_approval';
          // Create an ApprovalRequest so the business owner can review
          const approval = await prisma.approvalRequest.create({
            data: {
              userId: inputData.userId,
              customerId: inputData.authorId,
              customerName: inputData.authorName || undefined,
              customerHandle: inputData.authorId,
              platform: inputData.platform,
              draftContent: inputData.response,
              originalMessage: inputData.content,
              confidenceScore: Math.max(0, Math.min(1, inputData.leadScore / 100)),
              status: 'pending',
              commentId: inputData.commentId,
              postId: null, // The comment pipeline doesn't receive the postId; we can look it up
              expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // Expires in 24h
            },
          });
          approvalId = approval.id;
        } else {
          replyStatus = 'queued';
        }
      }

      await prisma.socialComment.update({
        where: { id: inputData.commentId },
        data: {
          category: inputData.category,
          sentiment: inputData.sentiment,
          leadScore: inputData.leadScore,
          urgencyScore: inputData.urgencyScore,
          escalationScore: inputData.escalationScore,
          replyContent: inputData.response,
          replyStatus,
          replyDelay: 45000,
        },
      });
      return { updated: true, replyStatus, approvalId };
    } catch (err) {
      console.error(`[CommentPipeline] Failed to update comment:`, err);
      return { updated: false, replyStatus: 'error', approvalId: null };
    }
  },
});

// ── Workflow: Comment Pipeline ──

export const commentPipeline = createWorkflow({
  id: 'comment-pipeline',
  inputSchema: z.object({
    commentId: z.string(),
    userId: z.string(),
    platform: z.string(),
    authorId: z.string(),
    authorName: z.string(),
    content: z.string(),
  }),
  outputSchema: z.object({
    response: z.string(),
    leadId: z.string().nullable(),
    dealCreated: z.boolean(),
    replyStatus: z.string(),
    approvalId: z.string().nullable(),
  }),
})
  .then(classifyStep)
  .then(leadStep)
  .then(replyStep)
  .then(updateStep)
  .commit();
