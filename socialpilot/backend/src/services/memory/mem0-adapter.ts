/**
 * MetaPilot AI — Mem0 Semantic Memory Adapter
 *
 * Wraps the Mem0 OSS Memory class with Qdrant (vector store) + OpenAI (embeddings + LLM)
 * to provide long-term semantic memory for customer interactions.
 *
 * Flow:
 *   Interaction occurs → store(userId, customerId, content, metadata)
 *     → Mem0 embeds the content, stores in Qdrant, links to user+session
 *
 *   New interaction → search(userId, query, customerId?)
 *     → Mem0 searches Qdrant for semantically similar memories → returns context
 *
 * Mem0 handles the full embedding + storage + retrieval pipeline internally,
 * including history tracking and automatic memory consolidation.
 */

import { Memory } from 'mem0ai/oss';
import { config as appConfig } from '../../config';

let _mem0: Memory | null = null;
let _initializing: Promise<Memory> | null = null;

/**
 * Configuration for a single memory entry.
 */
export interface MemoryEntry {
  /** The text content to store (embedded and searchable) */
  content: string;
  /** User ID (our internal userId — used as Entity.userId) */
  userId: string;
  /** Optional customer identifier to scope memories per customer (used as Entity.agentId) */
  customerId?: string;
  /** Optional platform (instagram, facebook, messenger) */
  platform?: string;
  /** Optional conversation ID for threading */
  conversationId?: string;
  /** Optional metadata (leadScore, intent, sentiment, etc.) */
  metadata?: Record<string, unknown>;
}

/**
 * A memory returned from a search query.
 */
export interface MemoryResult {
  id: string;
  content: string;
  score: number;
  userId: string;
  customerId?: string;
  platform?: string;
  conversationId?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

/**
 * Initialize the Mem0 Memory instance lazily.
 * Uses Qdrant as the vector store and OpenAI for embeddings + LLM.
 */
async function getMem0(): Promise<Memory> {
  if (_mem0) return _mem0;
  if (_initializing) return _initializing;

  _initializing = (async () => {
    const instance = new Memory({
      embedder: {
        provider: 'openai',
        config: {
          apiKey: appConfig.openai.apiKey,
          model: 'text-embedding-3-small',
        },
      },
      vectorStore: {
        provider: 'qdrant',
        config: {
          url: appConfig.qdrant.url,
          apiKey: appConfig.qdrant.apiKey || undefined,
          collectionName: 'socialpilot_memories',
        },
      },
      llm: {
        provider: 'openai',
        config: {
          apiKey: appConfig.openai.apiKey,
          model: appConfig.openai.model,
        },
      },
    });

    _mem0 = instance;
    return instance;
  })();

  return _initializing;
}

/**
 * Reset the Mem0 instance (useful for testing or config changes).
 */
export function resetMem0(): void {
  _mem0 = null;
  _initializing = null;
}

/**
 * Mem0-powered semantic memory service.
 *
 * API reference:
 * - Memory.add(messages: string | Message[], config: AddMemoryOptions): Promise<SearchResult>
 *   AddMemoryOptions extends Entity { userId, agentId, runId, metadata?, filters?, infer? }
 *   SearchResult = { results: MemoryItem[] }
 *   MemoryItem = { id, memory, hash, createdAt, updatedAt, score, metadata }
 *
 * - Memory.search(query: string, config: SearchMemoryOptions): Promise<SearchResult>
 *   SearchMemoryOptions = { topK?, filters?: SearchFilters, threshold? }
 *   SearchFilters = { user_id?, agent_id?, run_id?, ... }
 *
 * - Memory.getAll(config: GetAllMemoryOptions): Promise<SearchResult>
 *   GetAllMemoryOptions = { topK?, filters?: SearchFilters }
 *
 * - Memory.delete(memoryId: string): Promise<{ message: string }>
 * - Memory.history(memoryId: string): Promise<any[]>
 */
export const mem0Adapter = {
  /**
   * Store an interaction as a semantic memory.
   * Embeds the content and stores it in Qdrant via Mem0,
   * linked to the specified user and optionally to a specific customer.
   */
  async store(entry: MemoryEntry): Promise<{ id: string }> {
    const mem0 = await getMem0();

    const result = await mem0.add(entry.content, {
      userId: entry.userId,
      agentId: entry.customerId,
      metadata: {
        ...(entry.metadata || {}),
        ...(entry.platform ? { platform: entry.platform } : {}),
        ...(entry.conversationId ? { conversationId: entry.conversationId } : {}),
      },
    });

    const firstResult = result?.results?.[0];
    return { id: firstResult?.id || 'unknown' };
  },

  /**
   * Search for semantically similar memories.
   * Useful for finding relevant context about a customer before responding.
   */
  async search(
    userId: string,
    query: string,
    options?: {
      customerId?: string;
      limit?: number;
      threshold?: number;
    },
  ): Promise<MemoryResult[]> {
    const mem0 = await getMem0();

    const filters: Record<string, unknown> = {
      user_id: userId,
    };
    if (options?.customerId) {
      filters.agent_id = options.customerId;
    }

    const result = await mem0.search(query, {
      topK: options?.limit || 5,
      threshold: options?.threshold || 0.0,
      filters,
    });

    return (result?.results || []).map((r: any) => ({
      id: r.id || '',
      content: r.memory || '',
      score: r.score || 0,
      userId: r.user_id || userId,
      customerId: r.agent_id || options?.customerId,
      platform: r.metadata?.platform,
      conversationId: r.metadata?.conversationId,
      metadata: r.metadata || {},
      createdAt: r.created_at || r.createdAt || new Date().toISOString(),
    }));
  },

  /**
   * Get all memories for a specific user and optionally a specific customer.
   */
  async getAll(
    userId: string,
    options?: {
      customerId?: string;
      limit?: number;
    },
  ): Promise<MemoryResult[]> {
    const mem0 = await getMem0();

    const filters: Record<string, unknown> = {
      user_id: userId,
    };
    if (options?.customerId) {
      filters.agent_id = options.customerId;
    }

    const result = await mem0.getAll({
      topK: options?.limit || 20,
      filters,
    });

    return (result?.results || []).map((r: any) => ({
      id: r.id || '',
      content: r.memory || '',
      score: r.score || 0,
      userId: r.user_id || userId,
      customerId: r.agent_id || options?.customerId,
      platform: r.metadata?.platform,
      conversationId: r.metadata?.conversationId,
      metadata: r.metadata || {},
      createdAt: r.created_at || r.createdAt || new Date().toISOString(),
    }));
  },

  /**
   * Delete a specific memory by ID.
   */
  async delete(memoryId: string): Promise<void> {
    const mem0 = await getMem0();
    await mem0.delete(memoryId);
  },

  /**
   * Get the history of changes for a specific memory.
   */
  async history(memoryId: string): Promise<Array<{ previous: string; new: string; timestamp: string }>> {
    const mem0 = await getMem0();
    const result = await mem0.history(memoryId);
    return (result || []).map((h: any) => ({
      previous: h.prev_value || '',
      new: h.new_value || '',
      timestamp: h.updated_at || h.createdAt || new Date().toISOString(),
    }));
  },
};
