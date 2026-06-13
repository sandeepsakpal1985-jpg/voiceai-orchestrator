import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { classifyDMIntent } from '../../services/ai/classifier';
import { generateCompletion } from '../../services/ai/llm';
import { memoryService } from '../../services/memory/memory-service';
import { PrismaClient } from '@prisma/client';
import type { LeadCategory } from '@socialpilot/shared';

const prisma = new PrismaClient();

// ── Helpers ──

function getLeadCategory(score: number): LeadCategory {
  if (score >= 80) return 'vip';
  if (score >= 60) return 'hot';
  if (score >= 40) return 'warm';
  return 'cold';
}

// ── Step 1: Classify the DM intent ──

const classifyStep = createStep({
  id: 'classify-dm',
  inputSchema: z.object({
    conversationId: z.string(),
    userId: z.string(),
    platform: z.string(),
    senderId: z.string(),
    content: z.string(),
  }),
  outputSchema: z.object({
    conversationId: z.string(),
    userId: z.string(),
    platform: z.string(),
    senderId: z.string(),
    content: z.string(),
    intent: z.string(),
    leadScore: z.number(),
    purchaseProbability: z.number(),
    urgencyScore: z.number(),
  }),
  execute: async ({ inputData }) => {
    const classification = await classifyDMIntent(inputData.content);
    return {
      ...inputData,
      intent: classification.intent,
      leadScore: classification.leadScore,
      purchaseProbability: classification.purchaseProbability,
      urgencyScore: classification.urgencyScore,
    };
  },
});

// ── Step 2: Update customer memory in Prisma ──

const memoryStep = createStep({
  id: 'update-memory',
  inputSchema: z.object({
    conversationId: z.string(),
    userId: z.string(),
    platform: z.string(),
    senderId: z.string(),
    content: z.string(),
    intent: z.string(),
    leadScore: z.number(),
    purchaseProbability: z.number(),
    urgencyScore: z.number(),
  }),
  outputSchema: z.object({
    memoryUpdated: z.boolean(),
  }),
  execute: async ({ inputData }) => {
    try {
      const existing = await prisma.customerMemory.findUnique({
        where: {
          userId_socialHandle_platform: {
            userId: inputData.userId,
            socialHandle: inputData.senderId,
            platform: inputData.platform,
          },
        },
      });

      const journey = existing?.journey || [];
      if (!journey.includes('started_dm')) {
        journey.push('started_dm');
      }

      await prisma.customerMemory.upsert({
        where: {
          userId_socialHandle_platform: {
            userId: inputData.userId,
            socialHandle: inputData.senderId,
            platform: inputData.platform,
          },
        },
        create: {
          userId: inputData.userId,
          socialHandle: inputData.senderId,
          platform: inputData.platform,
          name: inputData.senderId,
          previousConversations: 1,
          previousPurchases: 0,
          maxLeadScore: inputData.leadScore,
          recentSentiment: inputData.leadScore >= 50 ? 0.5 : 0,
          journey,
          relationshipStatus: 'new',
        },
        update: {
          previousConversations: { increment: 1 },
          recentSentiment: inputData.leadScore >= 50 ? 0.5 : undefined,
          maxLeadScore: Math.max(inputData.leadScore, existing?.maxLeadScore || 0),
          journey,
          relationshipStatus:
            inputData.leadScore >= 80 ? 'vip'
            : (existing?.previousConversations || 0) >= 5 ? 'returning'
            : undefined,
        },
      });

      return { memoryUpdated: true };
    } catch (err) {
      console.error('[DMPipeline] Error updating customer memory:', err);
      return { memoryUpdated: false };
    }
  },
});

// ── Step 3: Create lead from DM (if score > 50) ──

const leadStep = createStep({
  id: 'create-lead',
  inputSchema: z.object({
    conversationId: z.string(),
    userId: z.string(),
    platform: z.string(),
    senderId: z.string(),
    content: z.string(),
    intent: z.string(),
    leadScore: z.number(),
    purchaseProbability: z.number(),
    urgencyScore: z.number(),
    memoryUpdated: z.boolean(),
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
          socialHandle: inputData.senderId,
        },
      });

      if (existingLead) {
        await prisma.lead.update({
          where: { id: existingLead.id },
          data: {
            leadScore: Math.max(existingLead.leadScore, inputData.leadScore),
            lastContactAt: new Date(),
            tags: { push: [`${inputData.intent}_dm`] },
          },
        });
        return { leadId: existingLead.id, dealCreated: false };
      }

      const emailMatch = inputData.content.match(/[\w.-]+@[\w.-]+\.\w+/);
      const phoneMatch = inputData.content.match(/[\+]?[\d\s-]{10,15}/);

      const lead = await prisma.lead.create({
        data: {
          userId: inputData.userId,
          socialHandle: inputData.senderId,
          platform: inputData.platform,
          category: getLeadCategory(inputData.leadScore),
          leadScore: inputData.leadScore,
          source: 'dm',
          tags: [`${inputData.intent}_dm`],
          lastContactAt: new Date(),
          email: emailMatch?.[0] || undefined,
          phone: phoneMatch?.[0] || undefined,
          conversationSummary: inputData.content.slice(0, 500),
          recommendedAction: inputData.leadScore >= 70 ? 'Send CTA and qualify budget' : 'Nurture with info',
        },
      });

      let dealCreated = false;
      if (inputData.leadScore >= 70) {
        await prisma.cRMDeal.create({
          data: {
            userId: inputData.userId,
            leadId: lead.id,
            title: `DM Lead - ${inputData.intent.replace('_', ' ')}`,
            stage: 'new_lead',
            leadScore: inputData.leadScore,
            aiSummary: `Auto-created from DM. Intent: ${inputData.intent}. ${inputData.content.slice(0, 200)}`,
            recommendedAction: 'Schedule demo or share pricing',
            notes: `Intent: ${inputData.intent}. Lead Score: ${inputData.leadScore}.`,
          },
        });
        dealCreated = true;
      }

      return { leadId: lead.id, dealCreated };
    } catch (err) {
      console.error('[DMPipeline] Error creating lead:', err);
      return { leadId: null, dealCreated: false };
    }
  },
});

// ── Step 4: Generate AI reply ──

const replyStep = createStep({
  id: 'generate-reply',
  inputSchema: z.object({
    conversationId: z.string(),
    userId: z.string(),
    platform: z.string(),
    senderId: z.string(),
    content: z.string(),
    intent: z.string(),
    leadScore: z.number(),
    purchaseProbability: z.number(),
    urgencyScore: z.number(),
    memoryUpdated: z.boolean(),
    leadId: z.string().nullable(),
    dealCreated: z.boolean(),
  }),
  outputSchema: z.object({
    response: z.string(),
  }),
  execute: async ({ inputData }) => {
    // Fetch recent conversation context
    let conversationContext = '';
    try {
      const recentMessages = await prisma.dMMessage.findMany({
        where: { conversationId: inputData.conversationId },
        orderBy: { createdAt: 'desc' },
        take: 3,
        select: { content: true, role: true },
      });
      conversationContext = recentMessages
        .reverse()
        .map(m => `[${m.role}] ${m.content}`)
        .join('\n');
    } catch (err) {
      console.error(`[DMPipeline] Failed to fetch conversation context:`, err);
    }

    // Search Mem0 for semantic memories
    let semanticContext = '';
    try {
      const memories = await memoryService.searchSemanticMemories({
        userId: inputData.userId,
        query: inputData.content,
        customerId: inputData.senderId,
        limit: 5,
      });
      if (memories.length > 0) {
        semanticContext = '[AI REMEMBERS]\n' +
          memories.map((m, i) =>
            `[Memory ${i + 1}] (relevance: ${Math.round(m.score * 100)}%)\n${m.content}`
          ).join('\n\n');
      }
    } catch (err) {
      console.error(`[DMPipeline] Failed to search semantic memory:`, err);
    }

    const semanticMemoriesSection = semanticContext
      ? `\n\n--- Previous Interactions (Semantic Memory) ---\n${semanticContext}`
      : '';

    const response = await generateCompletion({
      systemPrompt: `You are an AI sales assistant handling a ${inputData.platform} DM conversation.
Intent: ${inputData.intent}
Lead Score: ${inputData.leadScore}
Purchase Probability: ${inputData.purchaseProbability}
Urgency: ${inputData.urgencyScore}

Recent conversation:
${conversationContext}${semanticMemoriesSection}

Rules:
- Be conversational and build rapport — don't sound robotic
- Ask qualifying questions to learn about their needs, budget, and timeline
- If lead score > 70, work toward delivering the CTA (booking a demo, sharing pricing)
- If complaint, be empathetic and offer solutions
- If purchase probability > 60, highlight relevant benefits
- Store any information they share (name, email, phone, requirements) for memory
- Keep responses natural and concise (2-4 sentences)
- Use the [AI REMEMBERS] context above to personalize responses — refer back to previous interests and conversations naturally
- If the customer seems frustrated or the sentiment is negative, prioritize resolving their issue over selling`,
      messages: [{ role: 'user', content: inputData.content }],
      temperature: 0.7,
      maxTokens: 300,
    });

    return { response };
  },
});

// ── Step 5: Store reply and update conversation (with approval mode check) ──

const storeStep = createStep({
  id: 'store-reply',
  inputSchema: z.object({
    conversationId: z.string(),
    userId: z.string(),
    platform: z.string(),
    senderId: z.string(),
    content: z.string(),
    intent: z.string(),
    leadScore: z.number(),
    purchaseProbability: z.number(),
    urgencyScore: z.number(),
    memoryUpdated: z.boolean(),
    leadId: z.string().nullable(),
    dealCreated: z.boolean(),
    response: z.string(),
  }),
  outputSchema: z.object({
    stored: z.boolean(),
    semanticStored: z.boolean(),
    approvalId: z.string().nullable(),
  }),
  execute: async ({ inputData }) => {
    // Check if approval is required before storing the reply
    let needsApproval = false;
    try {
      const brandSettings = await prisma.brandSettings.findUnique({
        where: { userId: inputData.userId },
        select: { approvalModeType: true },
      });
      const modeType = brandSettings?.approvalModeType || 'fully_automatic';
      needsApproval = modeType === 'approval_required' || modeType === 'hybrid';
    } catch {
      // Default to no approval if we can't fetch settings
    }

    let approvalId: string | null = null;

    if (needsApproval) {
      // Create an ApprovalRequest instead of storing the AI reply as a message
      try {
        const approval = await prisma.approvalRequest.create({
          data: {
            userId: inputData.userId,
            customerId: inputData.senderId,
            platform: inputData.platform,
            draftContent: inputData.response,
            originalMessage: inputData.content,
            confidenceScore: Math.max(0, Math.min(1, inputData.leadScore / 100)),
            status: 'pending',
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          },
        });
        approvalId = approval.id;

        // Store the AI message as 'pending_approval' so the conversation context remains,
        // but the reply won't be sent to the customer until approved
        await prisma.dMMessage.create({
          data: {
            conversationId: inputData.conversationId,
            senderId: 'ai',
            content: inputData.response,
            role: 'assistant',
            metadata: { intent: inputData.intent, leadScore: inputData.leadScore, status: 'pending_approval', approvalId: approval.id },
          },
        });

        await prisma.dMConversation.update({
          where: { id: inputData.conversationId },
          data: {
            intent: inputData.intent,
            leadScore: inputData.leadScore,
            purchaseProbability: inputData.purchaseProbability,
            urgencyScore: inputData.urgencyScore,
            lastActivityAt: new Date(),
            status: 'pending_approval',
          },
        });

        // Still store semantic memory (useful even if not published yet)
        try {
          await memoryService.storeSemanticMemory({
            userId: inputData.userId,
            socialHandle: inputData.senderId,
            platform: inputData.platform,
            content: `[PENDING APPROVAL] User: ${inputData.content}\nAI: ${inputData.response}`,
            conversationId: inputData.conversationId,
            metadata: {
              intent: inputData.intent,
              leadScore: inputData.leadScore,
              status: 'pending_approval',
              approvalId: approval.id,
            },
          });
        } catch {
          // Non-critical — memory can be stored later
        }

        return { stored: true, semanticStored: true, approvalId };
      } catch (err) {
        console.error(`[DMPipeline] Failed to create approval request:`, err);
        // Fall through to store the reply directly if approval creation fails
      }
    }

    // Store AI response as a message (direct reply or fallback if approval creation failed)
    try {
      await prisma.dMMessage.create({
        data: {
          conversationId: inputData.conversationId,
          senderId: 'ai',
          content: inputData.response,
          role: 'assistant',
          metadata: { intent: inputData.intent, leadScore: inputData.leadScore },
        },
      });

      await prisma.dMConversation.update({
        where: { id: inputData.conversationId },
        data: {
          intent: inputData.intent,
          leadScore: inputData.leadScore,
          purchaseProbability: inputData.purchaseProbability,
          urgencyScore: inputData.urgencyScore,
          lastActivityAt: new Date(),
        },
      });
    } catch (err) {
      console.error(`[DMPipeline] Failed to store reply:`, err);
      return { stored: false, semanticStored: false, approvalId };
    }

    // Store interaction in Mem0 semantic memory
    let semanticStored = false;
    try {
      await memoryService.storeSemanticMemory({
        userId: inputData.userId,
        socialHandle: inputData.senderId,
        platform: inputData.platform,
        content: `User: ${inputData.content}\nAI: ${inputData.response}`,
        conversationId: inputData.conversationId,
        metadata: {
          intent: inputData.intent,
          leadScore: inputData.leadScore,
          purchaseProbability: inputData.purchaseProbability,
          urgency: inputData.urgencyScore,
        },
      });
      semanticStored = true;
    } catch (err) {
      console.error(`[DMPipeline] Failed to store semantic memory:`, err);
    }

    return { stored: true, semanticStored, approvalId };
  },
});

// ── Workflow: DM Pipeline ──

export const dmPipeline = createWorkflow({
  id: 'dm-pipeline',
  inputSchema: z.object({
    conversationId: z.string(),
    userId: z.string(),
    platform: z.string(),
    senderId: z.string(),
    content: z.string(),
  }),
  outputSchema: z.object({
    response: z.string(),
    leadId: z.string().nullable(),
    dealCreated: z.boolean(),
    approvalId: z.string().nullable(),
  }),
})
  .then(classifyStep)
  .then(memoryStep)
  .then(leadStep)
  .then(replyStep)
  .then(storeStep)
  .commit();
