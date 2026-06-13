/**
 * MetaPilot AI — PostHog Product Analytics Service
 *
 * Provides a centralized PostHog client with graceful degradation.
 * When NEXT_PUBLIC_POSTHOG_KEY is not configured, all operations are no-ops.
 * This allows the app to run in development without PostHog.
 */

import { config } from '../../config';

let posthog: any = null;
let initialized = false;

const POSTHOG_HOST = config.posthog.host || 'https://us.i.posthog.com';

/**
 * Initialize PostHog for the backend process.
 */
export function initPostHog(): void {
  if (initialized) return;

  const apiKey = config.posthog.apiKey;
  if (!apiKey) {
    console.log('[PostHog] POSTHOG_API_KEY not configured — product analytics disabled');
    return;
  }

  try {
    const PostHog = require('posthog-node');
    posthog = new PostHog(apiKey, {
      host: POSTHOG_HOST,
      flushAt: 20,
      flushInterval: 10000,
    });
    initialized = true;
    console.log('[PostHog] Initialized successfully');
  } catch (err) {
    console.warn('[PostHog] Failed to initialize:', err);
  }
}

/**
 * Capture a tracking event. Gracefully no-ops when PostHog is disabled.
 */
export function captureEvent(
  distinctId: string,
  event: string,
  properties?: Record<string, unknown>,
): void {
  if (!posthog) return;
  try {
    posthog.capture({
      distinctId,
      event,
      properties: {
        ...properties,
        environment: config.nodeEnv,
      },
    });
  } catch {
    // noop
  }
}

/**
 * Identify a user with their properties.
 */
export function identifyUser(
  distinctId: string,
  properties: Record<string, unknown>,
): void {
  if (!posthog) return;
  try {
    posthog.identify({
      distinctId,
      properties,
    });
  } catch {
    // noop
  }
}

/**
 * Alias an anonymous ID to a user ID (for signup flow).
 */
export function aliasUser(alias: string, distinctId: string): void {
  if (!posthog) return;
  try {
    posthog.alias({ alias, distinctId });
  } catch {
    // noop
  }
}

/**
 * Shut down PostHog and flush remaining events.
 * Call before server shutdown in production.
 */
export async function shutdownPostHog(timeoutMs: number = 2000): Promise<void> {
  if (!posthog) return;
  try {
    await posthog.shutdown();
    console.log('[PostHog] Shutdown complete');
  } catch {
    // noop
  }
}

/**
 * Check if PostHog is active.
 */
export function isPostHogEnabled(): boolean {
  return initialized;
}

/**
 * Get tracking event name helpers for consistent event naming.
 */
export const Events = {
  // Onboarding funnel
  ONBOARDING_STEP: 'onboarding_step',
  ONBOARDING_COMPLETE: 'onboarding_complete',

  // Meta connections
  META_CONNECTED: 'meta_connected',
  META_DISCONNECTED: 'meta_disconnected',
  META_TOKEN_REFRESHED: 'meta_token_refreshed',

  // CTA
  CTA_CREATED: 'cta_created',
  CTA_UPDATED: 'cta_updated',
  CTA_DELETED: 'cta_deleted',

  // Knowledge
  KNOWLEDGE_UPLOADED: 'knowledge_uploaded',

  // Leads
  LEAD_CREATED: 'lead_created',
  LEAD_CONVERTED: 'lead_converted',
  LEAD_UPDATED: 'lead_updated',

  // CRM
  CRM_DEAL_CREATED: 'crm_deal_created',
  CRM_DEAL_STAGE_CHANGED: 'crm_deal_stage_changed',
  CRM_DEAL_WON: 'crm_deal_won',
  CRM_DEAL_LOST: 'crm_deal_lost',

  // User activity
  USER_SIGNED_UP: 'user_signed_up',
  USER_LOGGED_IN: 'user_logged_in',
  USER_UPDATED_SETTINGS: 'user_updated_settings',

  // Approval
  APPROVAL_APPROVED: 'approval_approved',
  APPROVAL_REJECTED: 'approval_rejected',
  APPROVAL_EDITED: 'approval_edited',

  // Missed opportunities
  OPPORTUNITY_DETECTED: 'opportunity_detected',
  OPPORTUNITY_RECOVERED: 'opportunity_recovered',

  // Revenue
  REVENUE_GENERATED: 'revenue_generated',

  // Churn indicators
  USER_DISCONNECTED_PLATFORM: 'user_disconnected_platform',
  USER_DEACTIVATED: 'user_deactivated',

  // Email verification & password
  USER_EMAIL_VERIFIED: 'user_email_verified',
  USER_PASSWORD_RESET: 'user_password_reset',

  // Partner distribution
  PARTNER_CREATED: 'partner_created',
  PARTNER_CUSTOMER_ASSIGNED: 'partner_customer_assigned',
} as const;
