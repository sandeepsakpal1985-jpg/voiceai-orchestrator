/**
 * MetaPilot AI — Sentry Error Monitoring Service
 *
 * Provides a centralized Sentry wrapper with graceful degradation.
 * When SENTRY_DSN is not configured, all operations are no-ops.
 * This allows the app to run in development without Sentry.
 */

import type { FastifyInstance } from 'fastify';
import { config } from '../../config';

let Sentry: any = null;
let initialized = false;

/**
 * Initialize Sentry for the backend (Fastify) process.
 * Call this at the very start of the application entry point.
 */
export function initSentry(): void {
  if (initialized) return;

  const dsn = config.sentry.dsn;
  if (!dsn) {
    console.log('[Sentry] SENTRY_DSN not configured — error monitoring disabled');
    return;
  }

  try {
    // Dynamic import to avoid crashes if @sentry/node is not installed
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    Sentry = require('@sentry/node');

    Sentry.init({
      dsn,
      environment: config.sentry.environment,
      tracesSampleRate: config.sentry.tracesSampleRate,
      integrations: [],
      // Capture unhandled exceptions and rejections automatically
      defaultIntegrations: true,
    });

    initialized = true;
    console.log('[Sentry] Initialized successfully');
  } catch (err) {
    console.warn('[Sentry] Failed to initialize:', err);
  }
}

/**
 * Set the current user context for error tracking.
 */
export function setSentryUser(userId: string, email?: string, name?: string): void {
  if (!Sentry) return;
  try {
    Sentry.setUser({ id: userId, email, username: name });
  } catch {
    // noop
  }
}

/**
 * Capture an exception and send it to Sentry.
 * Returns the event ID if sent, or null if Sentry is disabled.
 */
export function captureException(error: Error, extra?: Record<string, unknown>): string | null {
  if (!Sentry) return null;
  try {
    return Sentry.captureException(error, { extra });
  } catch {
    return null;
  }
}

/**
 * Capture a message/breadcrumb event.
 */
export function captureMessage(message: string, level?: 'info' | 'warning' | 'error' | 'fatal'): void {
  if (!Sentry) return;
  try {
    Sentry.captureMessage(message, level || 'info');
  } catch {
    // noop
  }
}

/**
 * Add a breadcrumb for context.
 */
export function addBreadcrumb(category: string, message: string, data?: Record<string, unknown>): void {
  if (!Sentry) return;
  try {
    Sentry.addBreadcrumb({ category, message, data, level: 'info' });
  } catch {
    // noop
  }
}

/**
 * Register the Fastify error handler with Sentry.
 */
export function setupFastifyErrorHandler(app: FastifyInstance): void {
  if (!Sentry) return;
  try {
    if (typeof Sentry.setupFastifyErrorHandler === 'function') {
      Sentry.setupFastifyErrorHandler(app);
      console.log('[Sentry] Fastify error handler registered');
    }
  } catch {
    // noop
  }
}

/**
 * Flush pending events (call before shutdown).
 */
export async function flushSentry(timeoutMs: number = 2000): Promise<void> {
  if (!Sentry) return;
  try {
    await Sentry.flush(timeoutMs);
  } catch {
    // noop
  }
}

/**
 * Check if Sentry is active.
 */
export function isSentryEnabled(): boolean {
  return initialized;
}
