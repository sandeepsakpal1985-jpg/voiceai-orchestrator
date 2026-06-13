import { PrismaClient } from '@prisma/client';
import { mem0Adapter } from './mem0-adapter';

const prisma = new PrismaClient();

export class MemoryService {
  async getCustomer(socialHandle: string, platform: string, userId: string) {
    return prisma.customerMemory.findUnique({
      where: {
        userId_socialHandle_platform: { userId, socialHandle, platform },
      },
    });
  }

  async upsertCustomer(params: {
    userId: string;
    socialHandle: string;
    platform: string;
    name?: string;
    email?: string;
    phone?: string;
    company?: string;
    tags?: string[];
    journeyStep?: string;
    sentiment?: number;
    leadScore?: number;
  }) {
    const existing = await this.getCustomer(params.socialHandle, params.platform, params.userId);
    
    const journey = existing?.journey || [];
    if (params.journeyStep && !journey.includes(params.journeyStep)) {
      journey.push(params.journeyStep);
    }
    
    const allTags = [...new Set([...(existing?.tags || []), ...(params.tags || [])])];
    
    const relationshipStatus = params.leadScore && params.leadScore > 80 ? 'vip'
      : (existing?.previousConversations || 0) > 5 ? 'returning'
      : (existing?.previousPurchases || 0) > 0 ? 'customer'
      : 'new';

    return prisma.customerMemory.upsert({
      where: {
        userId_socialHandle_platform: {
          userId: params.userId,
          socialHandle: params.socialHandle,
          platform: params.platform,
        },
      },
      create: {
        userId: params.userId,
        socialHandle: params.socialHandle,
        platform: params.platform,
        name: params.name,
        email: params.email,
        phone: params.phone,
        company: params.company,
        tags: allTags,
        journey,
        recentSentiment: params.sentiment,
        maxLeadScore: params.leadScore || 0,
        relationshipStatus,
      },
      update: {
        name: params.name || undefined,
        email: params.email || undefined,
        phone: params.phone || undefined,
        company: params.company || undefined,
        tags: allTags,
        journey,
        previousConversations: { increment: 1 },
        recentSentiment: params.sentiment ?? undefined,
        maxLeadScore: Math.max(params.leadScore || 0, existing?.maxLeadScore || 0),
        relationshipStatus,
      },
    });
  }

  /**
   * Store an interaction as a semantic memory via Mem0.
   * This preserves the full context of the interaction beyond what
   * the structured Prisma model can capture (nuance, preferences, facts).
   */
  async storeSemanticMemory(params: {
    userId: string;
    socialHandle: string;
    platform: string;
    content: string;
    conversationId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<{ id: string }> {
    return mem0Adapter.store({
      content: `[${params.platform}] ${params.content}`,
      userId: params.userId,
      customerId: params.socialHandle,
      platform: params.platform,
      conversationId: params.conversationId,
      metadata: params.metadata,
    });
  }

  /**
   * Search semantic memories for relevant context about a customer.
   * Returns semantically similar past interactions to inform AI responses.
   */
  async searchSemanticMemories(params: {
    userId: string;
    query: string;
    customerId?: string;
    limit?: number;
  }) {
    return mem0Adapter.search(params.userId, params.query, {
      customerId: params.customerId,
      limit: params.limit || 5,
    });
  }

  /**
   * Get all semantic memories for a customer to build their profile.
   */
  async getCustomerSemanticProfile(userId: string, customerId: string) {
    return mem0Adapter.getAll(userId, { customerId, limit: 20 });
  }

  async getConversationSummary(userId: string, socialHandle: string): Promise<string> {
    const recent = await prisma.dMMessage.findMany({
      where: {
        conversation: { userId, customerId: socialHandle },
        role: 'assistant',
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { content: true, createdAt: true },
    });
    
    if (recent.length === 0) return '';
    return recent.reverse().map(m => `[${m.createdAt.toISOString().slice(0, 10)}] ${m.content}`).join('\n');
  }
}

export const memoryService = new MemoryService();
