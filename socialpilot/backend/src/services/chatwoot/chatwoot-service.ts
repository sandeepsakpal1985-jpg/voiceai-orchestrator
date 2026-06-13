/**
 * Chatwoot — Headless inbox integration service.
 *
 * Wraps the Chatwoot REST API to sync MetaPilot conversations
 * with Chatwoot's unified inbox. Uses Personal Access Token for auth.
 *
 * Docs: https://developers.chatwoot.com/docs/api/
 */

import { config } from '../../config';

interface ChatwootConfig {
  baseUrl: string;
  accountId: number;
  accessToken: string;
}

interface ChatwootContact {
  id: number;
  name: string;
  email: string | null;
  phone_number: string | null;
  identifier: string | null;
  additional_attributes: Record<string, unknown>;
  custom_attributes: Record<string, unknown>;
}

interface ChatwootConversation {
  id: number;
  contact_id: number;
  status: 'open' | 'resolved' | 'pending';
  messages: ChatwootMessage[];
  created_at: number;
}

interface ChatwootMessage {
  id: number;
  content: string;
  message_type: 'incoming' | 'outgoing';
  created_at: number;
  sender: { id: number; name: string };
}

type ChatwootWebhookPayload = {
  event: 'message_created' | 'conversation_created' | 'conversation_status_changed';
  id: number;
  conversation: {
    id: number;
    contact_inbox: { source_id: string };
    meta: { sender: { id: number; name: string; email: string | null } };
    status: string;
  };
  message?: {
    id: number;
    content: string;
    message_type: number; // 1 = incoming, 2 = outgoing
    created_at: number;
    sender: { id: number; name: string };
  };
  created_at: number;
};

export class ChatwootService {
  private baseUrl: string;
  private accountId: number;
  private accessToken: string;
  private headers: Record<string, string>;
  private initialized = false;

  constructor() {
    this.baseUrl = '';
    this.accountId = 0;
    this.accessToken = '';
    this.headers = {};
  }

  /** Initialize from app config. Must be called before using the service. */
  initialize(cfg: ChatwootConfig): void {
    this.baseUrl = cfg.baseUrl.replace(/\/+$/, '');
    this.accountId = cfg.accountId;
    this.accessToken = cfg.accessToken;
    this.headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.accessToken}`,
      'Accept': 'application/json',
    };
    this.initialized = true;
  }

  /** Initialize lazily from environment config */
  private ensureInitialized(): void {
    if (this.initialized) return;
    const baseUrl = process.env.CHATWOOT_BASE_URL || '';
    const accountId = parseInt(process.env.CHATWOOT_ACCOUNT_ID || '0', 10);
    const accessToken = process.env.CHATWOOT_ACCESS_TOKEN || '';
    if (!baseUrl || !accountId || !accessToken) {
      throw new Error(
        'Chatwoot not configured. Set CHATWOOT_BASE_URL, CHATWOOT_ACCOUNT_ID, and CHATWOOT_ACCESS_TOKEN.'
      );
    }
    this.initialize({ baseUrl, accountId, accessToken });
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    this.ensureInitialized();
    const url = `${this.baseUrl}/api/v1/accounts/${this.accountId}${path}`;

    const response = await fetch(url, {
      method,
      headers: this.headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => 'Unknown error');
      throw new Error(`Chatwoot API error (${response.status}): ${text}`);
    }

    return response.json() as Promise<T>;
  }

  // ── Contacts ──

  /** Find or create a contact by email or phone */
  async findOrCreateContact(params: {
    name: string;
    email?: string;
    phone?: string;
    identifier?: string;
    customAttributes?: Record<string, unknown>;
  }): Promise<ChatwootContact> {
    // Try to find by identifier first
    if (params.identifier) {
      try {
        const existing = await this.request<{ payload: ChatwootContact[] }>(
          'GET',
          `/contacts/search?q=${encodeURIComponent(params.identifier)}`
        );
        if (existing.payload.length > 0) return existing.payload[0];
      } catch {
        // Search failed — proceed to create
      }
    }

    const result = await this.request<{ payload: ChatwootContact }>(
      'POST',
      '/contacts',
      {
        name: params.name,
        email: params.email || null,
        phone_number: params.phone || null,
        identifier: params.identifier || null,
        custom_attributes: params.customAttributes || {},
      }
    );
    return result.payload;
  }

  // ── Conversations ──

  /** Create a new conversation for a contact */
  async createConversation(contactId: number): Promise<ChatwootConversation> {
    const result = await this.request<{ payload: ChatwootConversation }>(
      'POST',
      '/conversations',
      { contact_id: contactId }
    );
    return result.payload;
  }

  /** Send a message in a conversation */
  async sendMessage(
    conversationId: number,
    content: string
  ): Promise<ChatwootMessage> {
    const result = await this.request<{ payload: ChatwootMessage }>(
      'POST',
      `/conversations/${conversationId}/messages`,
      { content, message_type: 'outgoing' }
    );
    return result.payload;
  }

  /** List all conversations with optional status filter */
  async listConversations(params?: {
    status?: 'open' | 'resolved' | 'pending';
    page?: number;
  }): Promise<{
    payload: ChatwootConversation[];
    meta: { total: number; current_page: number };
  }> {
    const query = new URLSearchParams();
    if (params?.status) query.set('status', params.status);
    if (params?.page) query.set('page', String(params.page));
    query.set('limit', '50');

    const path = '/conversations' + (query.toString() ? `?${query.toString()}` : '');
    return this.request<{ payload: ChatwootConversation[]; meta: { total: number; current_page: number } }>('GET', path);
  }

  /** Get a single conversation with messages */
  async getConversation(conversationId: number): Promise<ChatwootConversation> {
    const result = await this.request<{ payload: ChatwootConversation }>(
      'GET',
      `/conversations/${conversationId}`
    );
    return result.payload;
  }

  /** Resolve a conversation */
  async resolveConversation(conversationId: number): Promise<void> {
    await this.request('PUT', `/conversations/${conversationId}`, {
      status: 'resolved',
    });
  }

  // ── Webhooks ──

  /** Validate and parse an incoming Chatwoot webhook payload */
  parseWebhookPayload(raw: unknown): ChatwootWebhookPayload | null {
    if (!raw || typeof raw !== 'object') return null;
    const payload = raw as Record<string, unknown>;

    if (
      !payload.event ||
      typeof payload.event !== 'string' ||
      !payload.conversation
    ) {
      return null;
    }

    return payload as unknown as ChatwootWebhookPayload;
  }

  /** Determine if the webhook event represents a new customer message */
  isCustomerMessage(payload: ChatwootWebhookPayload): boolean {
    return (
      payload.event === 'message_created' &&
      !!payload.message &&
      payload.message.message_type === 1 // incoming
    );
  }
}

export const chatwootService = new ChatwootService();
