import type {
  ConversationState,
  ConversationMessage,
  ConversationStatus,
  AgentSentiment,
} from "./types";
import { generateId } from "@/lib/utils";

const conversations = new Map<string, ConversationState>();

// Maps Twilio CallSid to conversation ID for lookups
const callSidToConversation = new Map<string, string>();

export function createConversation(params: {
  callSid?: string;
  campaignId?: string;
  contactName?: string;
  contactPhone: string;
  metadata?: Record<string, unknown>;
}): ConversationState {
  const  conversation: ConversationState = {
    id: generateId() + generateId(),
    contactName: params.contactName,
    contactPhone: params.contactPhone,
    campaignId: params.campaignId,
    messages: [],
    status: "initializing",
    sentiment: { label: "neutral", score: 0 },
    duration: 0,
    startedAt: Date.now(),
    metadata: { ...params.metadata, callSid: params.callSid },
  };

  conversations.set(conversation.id, conversation);

  // Store callSid mapping if provided (top-level or nested in metadata)
  const effectiveCallSid = params.callSid || (params.metadata?.callSid as string | undefined);
  if (effectiveCallSid) {
    callSidToConversation.set(effectiveCallSid, conversation.id);
  }

  return conversation;
}

export function getConversation(id: string): ConversationState | undefined {
  return conversations.get(id);
}

export function addMessage(
  conversationId: string,
  message: Omit<ConversationMessage, "id" | "timestamp">
): ConversationMessage {
  const conversation = conversations.get(conversationId);
  if (!conversation) throw new Error(`Conversation ${conversationId} not found`);

  const newMessage: ConversationMessage = {
    ...message,
    id: generateId(),
    timestamp: Date.now(),
  };

  conversation.messages.push(newMessage);
  conversation.status = "in_progress";

  return newMessage;
}

export function updateConversationStatus(
  conversationId: string,
  status: ConversationStatus
): void {
  const conversation = conversations.get(conversationId);
  if (!conversation) return;

  conversation.status = status;

  if (status === "completed" || status === "failed") {
    conversation.endedAt = Date.now();
    conversation.duration = conversation.endedAt - conversation.startedAt;
  }
}

export function updateSentiment(
  conversationId: string,
  sentiment: AgentSentiment
): void {
  const conversation = conversations.get(conversationId);
  if (!conversation) return;
  conversation.sentiment = sentiment;
}

export function getConversationHistory(
  conversationId: string,
  limit = 10
): ConversationMessage[] {
  const conversation = conversations.get(conversationId);
  if (!conversation) return [];
  return conversation.messages.slice(-limit);
}

export function getAllConversations(): ConversationState[] {
  return Array.from(conversations.values());
}

export function getAllActiveConversations(): ConversationState[] {
  return Array.from(conversations.values()).filter(
    (c) => c.status === "in_progress" || c.status === "initializing"
  );
}

/** Look up a conversation by Twilio CallSid */
export function getConversationByCallSid(callSid: string): ConversationState | undefined {
  const conversationId = callSidToConversation.get(callSid);
  if (!conversationId) return undefined;
  return conversations.get(conversationId);
}

export function generateSummary(conversation: ConversationState): string {
  if (conversation.messages.length === 0) return "No conversation recorded.";

  const messageCount = conversation.messages.length;
  const agentMessages = conversation.messages.filter((m) => m.role === "agent").length;
  const userMessages = conversation.messages.filter((m) => m.role === "user").length;

  return `Conversation with ${conversation.contactName || conversation.contactPhone}. ` +
    `${messageCount} messages exchanged (${agentMessages} agent, ${userMessages} user). ` +
    `Duration: ${Math.round(conversation.duration / 1000)}s. ` +
    `Final sentiment: ${conversation.sentiment.label} (${conversation.sentiment.score.toFixed(2)}).`;
}

export function analyzeSentiment(text: string): AgentSentiment {
  const positiveWords = [
    "great", "good", "excellent", "amazing", "wonderful", "fantastic",
    "helpful", "thanks", "thank", "perfect", "love", "best", "happy",
    "satisfied", "impressed", "awesome", "brilliant", "pleased",
  ];
  const negativeWords = [
    "bad", "terrible", "awful", "horrible", "worst", "hate", "angry",
    "frustrated", "disappointed", "useless", "poor", "waste", "upset",
    "annoyed", "unhappy", "dissatisfied", "terrible",
  ];

  const lower = text.toLowerCase();
  const words = lower.split(/\s+/);

  let positiveScore = 0;
  let negativeScore = 0;

  for (const word of words) {
    if (positiveWords.includes(word)) positiveScore++;
    if (negativeWords.includes(word)) negativeScore++;
  }

  const total = positiveScore + negativeScore;
  if (total === 0) return { label: "neutral", score: 0 };

  const netScore = (positiveScore - negativeScore) / total;

  if (netScore > 0.5) return { label: "very_positive", score: netScore };
  if (netScore > 0.1) return { label: "positive", score: netScore };
  if (netScore < -0.5) return { label: "very_negative", score: netScore };
  if (netScore < -0.1) return { label: "negative", score: netScore };
  return { label: "neutral", score: netScore };
}
