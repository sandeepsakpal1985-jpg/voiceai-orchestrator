/**
 * MetaPilot AI — Frontend PostHog Product Analytics
 *
 * Gracefully degrades when NEXT_PUBLIC_POSTHOG_KEY is not configured.
 * All operations become no-ops in development or when PostHog is disabled.
 */

let initialized = false;

/** Initialize PostHog for the browser. Call early in app startup from a client component. */
export function initPostHogFrontend(): void {
  if (initialized) return;

  const apiKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!apiKey) {
    if (process.env.NODE_ENV === 'development') {
      console.log('[PostHog] NEXT_PUBLIC_POSTHOG_KEY not configured — frontend analytics disabled');
    }
    return;
  }

  try {
    const posthog = require('posthog-js');
    const host = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com';

    posthog.init(apiKey, {
      api_host: host,
      capture_pageview: true,
      capture_pageleave: true,
      persistence: 'localStorage',
      loaded: () => {
        initialized = true;
        console.log('[PostHog] Frontend initialized');
      },
    });
  } catch (err) {
    console.warn('[PostHog] Frontend init failed:', err);
  }
}

/** Capture a frontend event. */
export function captureFrontendEvent(
  event: string,
  properties?: Record<string, unknown>,
): void {
  if (!initialized) return;
  try {
    const posthog = require('posthog-js');
    posthog.capture(event, properties);
  } catch {
    // noop
  }
}

/** Identify a user in PostHog from the frontend. */
export function identifyFrontendUser(
  distinctId: string,
  properties?: Record<string, unknown>,
): void {
  if (!initialized) return;
  try {
    const posthog = require('posthog-js');
    posthog.identify(distinctId, properties);
  } catch {
    // noop
  }
}

/** Reset the PostHog user (e.g. on logout). */
export function resetFrontendUser(): void {
  if (!initialized) return;
  try {
    const posthog = require('posthog-js');
    posthog.reset();
  } catch {
    // noop
  }
}

/** Check if PostHog is active. */
export function isPostHogFrontendEnabled(): boolean {
  return initialized;
}
