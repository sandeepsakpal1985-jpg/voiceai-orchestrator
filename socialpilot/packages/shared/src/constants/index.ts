// ──────────────────────────────────────────────
// MetaPilot AI — Shared Constants
// ──────────────────────────────────────────────

export const APP_NAME = 'MetaPilot AI';
export const APP_TAGLINE = 'AI Social Sales Agent';
export const APP_DESCRIPTION = 'Hire an AI sales employee in 5 minutes.';

export const ONBOARDING_STEPS = [
  'create_account',
  'connect_instagram',
  'connect_facebook',
  'upload_faqs',
  'add_cta',
  'choose_personality',
  'turn_on_automation',
] as const;

export const CRM_STAGES = [
  'new_lead',
  'contacted',
  'qualified',
  'demo_scheduled',
  'proposal_sent',
  'negotiation',
  'won',
  'lost',
] as const;

export const DEAL_STATUSES = {
  OPEN: 'open',
  QUALIFIED: 'qualified',
  PROPOSAL: 'proposal',
  WON: 'won',
  LOST: 'lost',
} as const;

export const APPROVAL_MODES = {
  FULLY_AUTOMATIC: 'fully_automatic',
  APPROVAL_REQUIRED: 'approval_required',
  HYBRID: 'hybrid',
} as const;

export const SENTIMENT_TYPES = {
  POSITIVE: 'positive',
  NEUTRAL: 'neutral',
  NEGATIVE: 'negative',
  CRISIS: 'crisis',
} as const;

export const REPUTATION_ALERT_REASONS = [
  'legal_threat',
  'scam_accusation',
  'viral_complaint',
  'refund_demand',
] as const;

export const LEAD_CATEGORIES = ['cold', 'warm', 'hot', 'vip'] as const;

export const COMMENT_DELAY_MIN = 45_000; // 45 seconds
export const COMMENT_DELAY_MAX = 90_000; // 90 seconds

export const REENGAGEMENT_DELAYS = {
  '24h': 24 * 60 * 60 * 1000,
  '3d': 3 * 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
} as const;

export const LEAD_SCORE_THRESHOLDS = {
  cold: 0,
  warm: 30,
  hot: 60,
  vip: 85,
} as const;

export const PAGINATION_DEFAULTS = {
  page: 1,
  limit: 20,
} as const;
