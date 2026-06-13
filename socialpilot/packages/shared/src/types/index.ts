// ──────────────────────────────────────────────
// MetaPilot AI — Shared Type Definitions
// ──────────────────────────────────────────────

// ── Auth ──
export type UserRole = "owner" | "admin" | "sales_agent" | "support_agent";

export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
}

// ── Meta Integration ──
export interface MetaConnection {
  id: string;
  userId: string;
  facebookPageId?: string;
  facebookPageName?: string;
  instagramAccountId?: string;
  instagramUsername?: string;
  accessToken: string;
  tokenExpiresAt: string;
  connectedAt: string;
  status: "active" | "expired" | "error";
}

// ── Comment Classification ──
export type CommentCategory =
  | "sales_inquiry"
  | "product_question"
  | "complaint"
  | "legal_threat"
  | "spam"
  | "competitor_mention"
  | "influencer_vip"
  | "existing_customer"
  | "general";

export interface CommentAnalysis {
  category: CommentCategory;
  sentiment: number; // -1 to 1
  leadScore: number; // 0 to 100
  urgencyScore: number; // 0 to 100
  escalationScore: number; // 0 to 100
}

export interface SocialComment {
  id: string;
  platform: "instagram" | "facebook";
  postId: string;
  authorId: string;
  authorName: string;
  content: string;
  mediaUrls?: string[];
  timestamp: string;
  analysis?: CommentAnalysis;
  replyStatus: "pending" | "queued" | "replied" | "approved" | "escalated";
  replyContent?: string;
  replyDelay?: number;
  repliedAt?: string;
}

// ── DM ──
export type DMIntent =
  | "sales_inquiry"
  | "support"
  | "complaint"
  | "pricing"
  | "demo_request"
  | "partnership"
  | "general";

export interface DMMessage {
  id: string;
  conversationId: string;
  platform: "instagram" | "messenger";
  senderId: string;
  content: string;
  mediaUrls?: string[];
  timestamp: string;
  role: "user" | "assistant" | "human";
  metadata?: Record<string, unknown>;
}

export interface DMConversation {
  id: string;
  userId: string;
  customerId: string;
  platform: "instagram" | "messenger";
  status: "active" | "human_takeover" | "resolved" | "escalated";
  messages: DMMessage[];
  intent?: DMIntent;
  leadScore?: number;
  purchaseProbability?: number;
  urgencyScore?: number;
  createdAt: string;
  updatedAt: string;
  lastActivityAt: string;
}

// ── Lead ──
export type LeadCategory = "cold" | "warm" | "hot" | "vip";

export interface Lead {
  id: string;
  userId: string;
  name?: string;
  socialHandle: string;
  platform: "instagram" | "facebook" | "messenger";
  phone?: string;
  email?: string;
  company?: string;
  city?: string;
  requirement?: string;
  budget?: string;
  category: LeadCategory;
  leadScore: number;
  sentiment: number;
  source: "comment" | "dm" | "manual";
  ctaClicks: number;
  lastContactAt: string;
  conversationSummary?: string;
  recommendedAction?: string;
  tags: string[];
  createdAt: string;
}

// ── CRM ──
export type CRMPipelineStage =
  | "new_lead"
  | "contacted"
  | "qualified"
  | "demo_scheduled"
  | "proposal_sent"
  | "negotiation"
  | "won"
  | "lost";

export type DealStatus = 'open' | 'qualified' | 'proposal' | 'won' | 'lost';

export interface CRMDeal {
  id: string;
  userId: string;
  leadId: string;
  title: string;
  value?: number;
  revenue?: number;
  currency?: string;
  stage: CRMPipelineStage;
  dealStatus: DealStatus;
  assignedTo?: string;
  notes?: string;
  activityTimeline: CRMActivity[];
  followUpAt?: string;
  aiSummary?: string;
  leadScore?: number;
  sentiment?: number;
  recommendedAction?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RevenueSummary {
  totalRevenue: number;
  currentMonthRevenue: number;
  aiAttributedRevenue: number;
  aiRevenuePercentage: number;
  dealsWon: number;
  opportunitiesCreated: number;
  leadsGenerated: number;
  leadToOpportunityRate: number;
  opportunityToWonRate: number;
}

export interface CRMActivity {
  id: string;
  dealId: string;
  type: "note" | "call" | "email" | "demo" | "meeting" | "follow_up";
  content: string;
  createdBy: string;
  createdAt: string;
}

// ── Knowledge ──
export interface KnowledgeDocument {
  id: string;
  userId: string;
  title: string;
  type: "faq" | "product" | "pricing" | "policy" | "script";
  content: string;
  embeddings?: number[];
  fileUrl?: string;
  fileType?: "pdf" | "docx" | "txt";
  createdAt: string;
}

// ── AI Personality ──
export type AIPersonality =
  | "friendly"
  | "premium"
  | "luxury"
  | "customer_support"
  | "sales_closer";

export interface AIPersonalityConfig {
  id: AIPersonality;
  name: string;
  tone: string;
  systemPrompt: string;
  temperature: number;
}

// ── CTA ──
export type CTAType = "website" | "whatsapp" | "calendly" | "demo_booking" | "payment_link";

export interface CTAConfig {
  id: string;
  userId: string;
  type: CTAType;
  label: string;
  url: string;
  isDefault: boolean;
  conditions?: {
    minLeadScore?: number;
    afterMessages?: number;
  };
  createdAt: string;
}

// ── Escalation ──
export type EscalationReason =
  | "legal_threat"
  | "consumer_court"
  | "fraud_accusation"
  | "chargeback_threat"
  | "viral_complaint"
  | "abusive_message";

export interface EscalationTicket {
  id: string;
  userId: string;
  customerId: string;
  reason: EscalationReason;
  severity: "low" | "medium" | "high" | "critical";
  context: string;
  aiPaused: boolean;
  status: "open" | "in_progress" | "resolved";
  assignedTo?: string;
  resolution?: string;
  createdAt: string;
  resolvedAt?: string;
}

// ── Customer Memory ──
export interface CustomerMemory {
  id: string;
  socialHandle: string;
  platform: string;
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
  previousConversations: number;
  previousPurchases: number;
  maxLeadScore: number;
  recentSentiment: number;
  tags: string[];
  journey: CustomerJourneyStep[];
  relationshipStatus: "new" | "returning" | "customer" | "vip";
  metadata: Record<string, unknown>;
  updatedAt: string;
}

export type CustomerJourneyStep =
  | "commented"
  | "started_dm"
  | "shared_contact"
  | "qualified"
  | "demo_scheduled"
  | "purchased";

// ── Analytics ──
export interface AnalyticsMetrics {
  commentsReceived: number;
  commentsReplied: number;
  replyRate: number;
  dmsReceived: number;
  dmsReplied: number;
  leadsGenerated: number;
  hotLeads: number;
  warmLeads: number;
  qualifiedLeads: number;
  crmOpportunities: number;
  escalations: number;
  ctaClickRate: number;
  aiSuccessRate: number;
  estimatedRevenue: number;
  meetingsBooked: number;
  commentToDMConversion: number;
  leadGenerationRate: number;
}

export type AnalyticsPeriod = "daily" | "weekly" | "monthly" | "yearly";

// ── Onboarding ──
export type OnboardingStep =
  | "create_account"
  | "connect_instagram"
  | "connect_facebook"
  | "upload_faqs"
  | "add_cta"
  | "choose_personality"
  | "turn_on_automation";

export interface OnboardingState {
  userId: string;
  currentStep: OnboardingStep;
  completed: boolean;
  steps: Record<OnboardingStep, boolean>;
}

// ── Tags ──
export type AutoTag =
  | "hot_lead"
  | "warm_lead"
  | "cold_lead"
  | "existing_customer"
  | "vip_customer"
  | "influencer"
  | "bulk_buyer"
  | "franchise_inquiry"
  | "refund_risk"
  | "complaint"
  | "pricing_inquiry"
  | "demo_request";

// ── API Common ──
export interface PaginationParams {
  page: number;
  limit: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface APIResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// ── Queue Jobs ──
export interface CommentJobData {
  commentId: string;
  userId: string;
  platform: "instagram" | "facebook";
  postId: string;
  authorId: string;
  authorName?: string;
  content: string;
}

export interface DMJobData {
  conversationId: string;
  userId: string;
  platform: "instagram" | "messenger";
  senderId: string;
  content: string;
}

export interface ReEngagementJobData {
  customerId: string;
  userId: string;
  stage: "24h" | "3d" | "7d";
  customerName?: string;
  leadScore?: number;
}

// ── Approval Mode ──
export type ApprovalStatus = 'pending' | 'approved' | 'rejected';
export type ApprovalMode = 'fully_automatic' | 'approval_required' | 'hybrid';

export interface ApprovalRequest {
  id: string;
  userId: string;
  customerId: string;
  customerName?: string;
  customerHandle?: string;
  platform: 'instagram' | 'facebook' | 'messenger';
  draftContent: string;
  originalMessage?: string;
  confidenceScore?: number;
  status: ApprovalStatus;
  reviewedBy?: string;
  reviewNote?: string;
  expiresAt?: string;
  createdAt: string;
  reviewedAt?: string;
}

export interface ApprovalStats {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  approvalRate: number;
  rejectionRate: number;
}

// ── Brand / Business Settings ──
export interface BrandSettings {
  id: string;
  userId: string;
  businessName: string;
  industry?: string;
  website?: string;
  toneInstructions?: string;
  customInstructions?: string;
  automationEnabled: boolean;
  approvalMode: boolean;
  approvalModeType?: ApprovalMode;
  timezone: string;
  operatingHours?: {
    enabled: boolean;
    monday?: { start: string; end: string };
    tuesday?: { start: string; end: string };
    wednesday?: { start: string; end: string };
    thursday?: { start: string; end: string };
    friday?: { start: string; end: string };
    saturday?: { start: string; end: string };
    sunday?: { start: string; end: string };
  };
  updatedAt: string;
}

// ── AI Insights ──
export type InsightCategory =
  | "common_questions"
  | "common_objections"
  | "requested_products"
  | "best_cta"
  | "sentiment_trend"
  | "response_quality";

export interface Insight {
  id: string;
  userId: string;
  category: InsightCategory;
  title: string;
  description: string;
  value: number;
  trend: "up" | "down" | "stable";
  period: AnalyticsPeriod;
  generatedAt: string;
}

export interface InsightReport {
  id: string;
  userId: string;
  period: AnalyticsPeriod;
  insights: Insight[];
  summary: string;
  recommendations: string[];
  generatedAt: string;
}

// ── Missed Opportunity ──
export type MissedOpportunityType =
  | 'unanswered_comment'
  | 'ignored_lead'
  | 'stalled_conversation'
  | 'missed_follow_up'
  | 'pricing_unanswered'
  | 'purchase_intent_unanswered';

export interface MissedOpportunity {
  id: string;
  userId: string;
  type: MissedOpportunityType;
  description: string;
  customerHandle?: string;
  customerName?: string;
  platform?: string;
  message?: string;
  potentialValue?: number;
  recommendedAction?: string;
  firstDetectedAt: string;
  resolvedAt?: string;
  status: 'open' | 'resolved' | 'dismissed';
}

// ── Notifications ──
export type NotificationType =
  | "new_lead"
  | "escalation"
  | "missed_opportunity"
  | "approval_required"
  | "insight_ready"
  | "human_takeover"
  | "weekly_report";

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  link?: string;
  read: boolean;
  createdAt: string;
}

// ── AI Sales Copilot ──
export interface CopilotSuggestion {
  id: string;
  userId: string;
  conversationId: string;
  suggestionType: "reply" | "objection_handling" | "follow_up" | "closing_strategy";
  content: string;
  context: string;
  confidence: number;
  createdAt: string;
}

// ── Audit Log ──
export type AuditAction =
  | "user.login"
  | "user.logout"
  | "meta.connect"
  | "meta.disconnect"
  | "meta.token_refresh"
  | "settings.update"
  | "automation.toggle"
  | "ai.response_edited"
  | "escalation.resolved"
  | "team.member_added"
  | "team.member_removed"
  | "subscription.changed";

export interface AuditLogEntry {
  id: string;
  userId: string;
  actorId: string;
  action: AuditAction;
  resourceType: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  createdAt: string;
}

// ── Subscription / Billing ──
export type SubscriptionPlan = "free" | "starter" | "professional" | "enterprise";
export type SubscriptionStatus = "active" | "canceled" | "past_due" | "trialing";

export interface Subscription {
  id: string;
  userId: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  features: string[];
  limits: {
    maxConnections: number;
    maxLeads: number;
    maxCrmDeals: number;
    maxTeamMembers: number;
    aiResponseLimit: number;
  };
  currentPeriodStart: string;
  currentPeriodEnd: string;
  canceledAt?: string;
}

// ── Webhook Events ──
export interface MetaWebhookEvent {
  object: "instagram" | "page";
  entry: Array<{
    id: string;
    time: number;
    changes?: Array<{
      field: string;
      value: Record<string, unknown>;
    }>;
    messaging?: Array<{
      sender: { id: string };
      recipient: { id: string };
      timestamp: number;
      message?: Record<string, unknown>;
    }>;
  }>;
}

// ── Usage Tracking ──
export interface UsageRecord {
  id: string;
  userId: string;
  metric: "ai_responses" | "leads_captured" | "comments_processed" | "dms_processed" | "api_calls";
  count: number;
  date: string;
}

// ── Inbox Types ──
export type InboxItemStatus = "unread" | "read" | "replied" | "escalated" | "resolved";
export type InboxItemPriority = "low" | "normal" | "high" | "urgent";

export interface InboxItem {
  id: string;
  userId: string;
  platform: "instagram" | "facebook" | "messenger";
  type: "comment" | "dm";
  customerHandle: string;
  customerName?: string;
  content: string;
  status: InboxItemStatus;
  priority: InboxItemPriority;
  assignedTo?: string;
  aiSuggestedReply?: string;
  internalNote?: string;
  conversationId?: string;
  leadId?: string;
  createdAt: string;
}

// ── Re-engagement ──
export interface ReEngagementRule {
  id: string;
  userId: string;
  enabled: boolean;
  stages: Array<{
    delay: "24h" | "3d" | "7d";
    messageTemplate: string;
  }>;
  conditions: {
    minLeadScore?: number;
    onlyDormant: boolean;
    excludeCustomers: boolean;
  };
}
