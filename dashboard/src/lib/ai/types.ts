export type AgentRole = "assistant" | "sales" | "support" | "survey" | "custom";

export type AgentConfig = {
  id?: string;
  name: string;
  role: AgentRole;
  systemPrompt: string;
  voiceId: string;
  language: string;
  speakingRate: number;
  pitch: number;
  temperature?: number;
  maxTokens?: number;
};

export type ConversationMessage = {
  id: string;
  role: "agent" | "user" | "system";
  content: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
};

export type ConversationState = {
  id: string;
  campaignId?: string;
  contactName?: string;
  contactPhone: string;
  messages: ConversationMessage[];
  status: ConversationStatus;
  sentiment: AgentSentiment;
  duration: number;
  startedAt: number;
  endedAt?: number;
  metadata?: Record<string, unknown>;
};

export type ConversationStatus =
  | "initializing"
  | "in_progress"
  | "paused"
  | "completed"
  | "failed"
  | "transferred";

export type AgentSentiment = {
  label: "very_positive" | "positive" | "neutral" | "negative" | "very_negative";
  score: number;
};

export type LLMProvider = "openai" | "anthropic" | "custom";

export type LLMConfig = {
  provider: LLMProvider;
  apiKey?: string;
  baseUrl?: string;
  model: string;
  temperature: number;
  maxTokens: number;
};

export type STTProvider = "browser" | "google" | "azure" | "deepgram";

export type STTConfig = {
  provider: STTProvider;
  apiKey?: string;
  language: string;
  model?: string;
};

export type TTSProvider = "browser" | "google" | "azure" | "elevenlabs";

export type TTSConfig = {
  provider: TTSProvider;
  apiKey?: string;
  voiceId: string;
  language: string;
  speakingRate: number;
  pitch: number;
};

export type AgentEvent =
  | { type: "conversation_started"; conversationId: string }
  | { type: "message_received"; message: ConversationMessage }
  | { type: "agent_response"; message: ConversationMessage }
  | { type: "transcription"; text: string; isFinal: boolean }
  | { type: "sentiment_update"; sentiment: AgentSentiment }
  | { type: "conversation_ended"; conversationId: string; summary?: string }
  | { type: "error"; message: string; code?: string };

export type CallRequest = {
  to: string;
  from?: string;
  campaignId?: string;
  contactName?: string;
  prompt?: string;
  voiceId?: string;
  language?: string;
  metadata?: Record<string, unknown>;
};

export type CallResponse = {
  callId: string;
  conversationId: string;
  status: ConversationStatus;
  message: string;
};

export type LLMCompletionRequest = {
  messages: { role: "system" | "user" | "assistant"; content: string }[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
};

export type LLMCompletionResponse = {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
};
