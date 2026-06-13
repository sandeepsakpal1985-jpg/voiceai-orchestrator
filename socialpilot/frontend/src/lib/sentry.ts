/**
 * MetaPilot AI — Frontend Sentry Integration
 *
 * Gracefully degrades when SENTRY_DSN is not configured.
 * All operations become no-ops in development or when Sentry is disabled.
 */

let initialized = false;

/** Initialize Sentry for the browser. Call early in app startup. */
export function initFrontendSentry(): void {
  if (initialized) return;

  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) {
    if (process.env.NODE_ENV === 'development') {
      console.log('[Sentry] NEXT_PUBLIC_SENTRY_DSN not configured — frontend error monitoring disabled');
    }
    return;
  }

  try {
    // Dynamic import to avoid build errors if package is missing
    const Sentry = require('@sentry/react');

    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV || 'development',
      tracesSampleRate: parseFloat(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE || '0.1'),
      integrations: [],
      // Enable session replay for better debugging
      replaysSessionSampleRate: 0.1,
      replaysOnErrorSampleRate: 1.0,
    });

    initialized = true;
    console.log('[Sentry] Frontend initialized');
  } catch (err) {
    console.warn('[Sentry] Frontend init failed:', err);
  }
}

/** Capture a frontend exception. */
export function captureFrontendException(error: Error, extra?: Record<string, unknown>): string | null {
  if (!initialized) return null;
  try {
    const Sentry = require('@sentry/react');
    return Sentry.captureException(error, { extra });
  } catch {
    return null;
  }
}

/** Capture a frontend message. */
export function captureFrontendMessage(message: string, level?: 'info' | 'warning' | 'error'): void {
  if (!initialized) return;
  try {
    const Sentry = require('@sentry/react');
    Sentry.captureMessage(message, level || 'info');
  } catch {
    // noop
  }
}
