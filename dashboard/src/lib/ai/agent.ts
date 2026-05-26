import type {
  AgentConfig,
  ConversationState,
  ConversationMessage,
  AgentEvent,
  CallRequest,
  CallResponse,
  LLMCompletionRequest,
} from "./types";
import {
  createConversation,
  addMessage,
  updateConversationStatus,
  updateSentiment,
  getConversation,
  getAllConversations,
  getAllActiveConversations,
  generateSummary,
  analyzeSentiment,
} from "./conversation";
import { complete } from "./llm";

type EventCallback = (event: AgentEvent) => void;

export class VoiceAgent {
  private config: AgentConfig;
  private listeners: Map<string, Set<EventCallback>> = new Map();

  constructor(config: AgentConfig) {
    this.config = config;
  }

  updateConfig(config: Partial<AgentConfig>) {
    this.config = { ...this.config, ...config };
  }

  getConfig(): AgentConfig {
    return { ...this.config };
  }

  on(event: string, callback: EventCallback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
    return () => this.listeners.get(event)?.delete(callback);
  }

  private emit(event: AgentEvent) {
    const type = event.type;
    const callbacks = this.listeners.get(type);
    if (callbacks) {
      callbacks.forEach((cb) => cb(event));
    }
  }

  async handleIncomingCall(request: CallRequest): Promise<CallResponse> {
    const conversation = createConversation({
      campaignId: request.campaignId,
      contactName: request.contactName,
      contactPhone: request.to,
      metadata: request.metadata,
    });

    this.emit({
      type: "conversation_started",
      conversationId: conversation.id,
    });

    const greeting = this.config.systemPrompt
      ? await this.generateGreeting(conversation)
      : `Hello${request.contactName ? " " + request.contactName : ""}! Thank you for calling. I'm ${this.config.name}, your AI voice assistant. How can I help you today?`;

    addMessage(conversation.id, {
      role: "agent",
      content: greeting,
    });

    this.emit({
      type: "agent_response",
      message: conversation.messages[conversation.messages.length - 1],
    });

    return {
      callId: `call_${conversation.id}`,
      conversationId: conversation.id,
      status: conversation.status,
      message: greeting,
    };
  }

  async processUserInput(
    conversationId: string,
    userInput: string
  ): Promise<ConversationMessage> {
    const conversation = getConversation(conversationId);
    if (!conversation) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    addMessage(conversationId, {
      role: "user",
      content: userInput,
    });

    this.emit({
      type: "message_received",
      message: conversation.messages[conversation.messages.length - 1],
    });

    const sentiment = analyzeSentiment(userInput);
    updateSentiment(conversationId, sentiment);

    this.emit({
      type: "sentiment_update",
      sentiment,
    });

    const contextMessages = this.buildContext(conversation);

    const llmRequest: LLMCompletionRequest = {
      messages: contextMessages,
    };

    const response = await complete(llmRequest);

    addMessage(conversationId, {
      role: "agent",
      content: response.content,
    });

    const agentMessage = conversation.messages[conversation.messages.length - 1];

    this.emit({
      type: "agent_response",
      message: agentMessage,
    });

    return agentMessage;
  }

  /**
   * Returns all conversations, optionally filtered to active ones.
   */
  getConversations(activeOnly = false): ConversationState[] {
    if (activeOnly) {
      return getAllActiveConversations();
    }
    return getAllConversations();
  }

  /**
   * Alias for getConversations(true).
   */
  getActiveConversations(): ConversationState[] {
    return getAllActiveConversations();
  }

  async endConversation(conversationId: string): Promise<string> {
    const conversation = getConversation(conversationId);
    if (!conversation) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    updateConversationStatus(conversationId, "completed");

    const summary = generateSummary(conversation);

    this.emit({
      type: "conversation_ended",
      conversationId,
      summary,
    });

    return summary;
  }

  private async generateGreeting(conversation: ConversationState): Promise<string> {
    const systemContext = this.config.systemPrompt;
    const contactName = conversation.contactName;

    try {
      const response = await complete({
        messages: [
          {
            role: "system",
            content: `${systemContext}\n\nGenerate a brief, natural greeting for the caller${contactName ? " named " + contactName : ""}. Keep it under 30 words and make it sound human, not robotic.`,
          },
          {
            role: "user",
            content: "Start the conversation",
          },
        ],
        maxTokens: 100,
        temperature: 0.7,
      });
      return response.content;
    } catch {
      return `Hello${contactName ? " " + contactName : ""}! Thank you for calling. How can I help you today?`;
    }
  }

  private buildContext(conversation: ConversationState): { role: "system" | "user" | "assistant"; content: string }[] {
    const messages: { role: "system" | "user" | "assistant"; content: string }[] = [];

    messages.push({
      role: "system",
      content: this.config.systemPrompt || `You are ${this.config.name}, a friendly and professional AI voice assistant. Keep your responses concise and conversational, as this is a voice call. Speak naturally and ask relevant follow-up questions.`,
    });

    const recentMessages = conversation.messages.slice(-6);
    for (const msg of recentMessages) {
      messages.push({
        role: msg.role === "agent" ? "assistant" : msg.role,
        content: msg.content,
      });
    }

    return messages;
  }
}

let defaultAgent: VoiceAgent | null = null;

export function getDefaultAgent(): VoiceAgent {
  if (!defaultAgent) {
    defaultAgent = new VoiceAgent({
      name: "AI Assistant",
      role: "assistant",
      systemPrompt:
        "You are a friendly and professional AI voice assistant. Keep responses concise and conversational. Ask relevant follow-up questions to understand the caller's needs better. Be helpful, patient, and natural.",
      voiceId: "en-US-Wavenet-D",
      language: "en-US",
      speakingRate: 1.0,
      pitch: 0,
    });
  }
  return defaultAgent;
}

export function setDefaultAgent(agent: VoiceAgent) {
  defaultAgent = agent;
}
