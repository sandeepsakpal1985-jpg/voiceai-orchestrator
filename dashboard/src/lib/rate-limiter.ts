/**
 * VoiceAI Dashboard — Rate Limiter
 *
 * In-memory IP-based rate limiter with sliding window algorithm.
 * Configurable limits per route/method pattern.
 *
 * For production at scale, replace with Redis-based implementation
 * (e.g., Vercel KV, Upstash Redis).
 */

// ── Types ──────────────────────────────────────────────────────────

export interface RateLimitConfig {
  /** Max number of requests allowed within the window */
  limit: number;
  /** Time window in milliseconds */
  windowMs: number;
}

export interface RateLimitResult {
  /** Whether the request is allowed */
  allowed: boolean;
  /** Remaining requests in the current window */
  remaining: number;
  /** Unix timestamp (ms) when the window resets */
  resetAt: number;
  /** Maximum requests per window */
  limit: number;
}

// ── Default configurations ─────────────────────────────────────────

export const DEFAULT_CONFIG: RateLimitConfig = {
  limit: 60,
  windowMs: 60_000, // 1 minute
};

/** Stricter limit for auth/sensitive endpoints */
export const AUTH_CONFIG: RateLimitConfig = {
  limit: 10,
  windowMs: 60_000, // 10 requests per minute
};

/** Generous limit for webhook endpoints (Twilio may batch) */
export const WEBHOOK_CONFIG: RateLimitConfig = {
  limit: 200,
  windowMs: 60_000,
};

/** Limit for monitoring endpoint */
export const MONITORING_CONFIG: RateLimitConfig = {
  limit: 30,
  windowMs: 60_000,
};

// ── Route-based limit configuration ─────────────────────────────────

export interface RouteRule {
  pattern: RegExp;
  method?: string;
  config: RateLimitConfig;
}

export const ROUTE_RULES: RouteRule[] = [
  // Auth endpoints: strict limits
  { pattern: /^\/api\/auth\//, config: AUTH_CONFIG },
  { pattern: /^\/api\/ws-token/, config: AUTH_CONFIG },
  // Webhook endpoints: generous limits
  { pattern: /^\/api\/webhooks\//, config: WEBHOOK_CONFIG },
  // Monitoring: moderate limit
  { pattern: /^\/api\/monitoring/, config: MONITORING_CONFIG },
  // Default: applied to all /api/* routes
];

/**
 * Resolve the rate limit config for a given path and method.
 */
export function getConfigForRoute(path: string, method?: string): RateLimitConfig {
  for (const rule of ROUTE_RULES) {
    if (rule.pattern.test(path)) {
      if (!rule.method || rule.method === method) {
        return rule.config;
      }
    }
  }
  return DEFAULT_CONFIG;
}

// ── Sliding Window Store ───────────────────────────────────────────

interface WindowEntry {
  timestamps: number[];
}

const store = new Map<string, WindowEntry>();

// Cleanup stale entries every 60 seconds
const CLEANUP_INTERVAL = 60_000;
let lastCleanup = Date.now();

function cleanup(): void {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;

  for (const [key, entry] of store.entries()) {
    // Remove entries with no recent activity
    if (entry.timestamps.length === 0 || now - entry.timestamps[entry.timestamps.length - 1] > 120_000) {
      store.delete(key);
    }
  }
}

// ── Rate Limit Check ───────────────────────────────────────────────

/**
 * Check if a request should be rate limited.
 *
 * @param identifier - Unique identifier (typically IP address or user ID)
 * @param config - Rate limit configuration
 * @returns RateLimitResult indicating if the request is allowed
 */
export function checkRateLimit(
  identifier: string,
  config: RateLimitConfig = DEFAULT_CONFIG
): RateLimitResult {
  cleanup();

  const now = Date.now();
  const windowStart = now - config.windowMs;

  const entry = store.get(identifier) ?? { timestamps: [] };

  // Remove timestamps outside the current window
  entry.timestamps = entry.timestamps.filter((ts) => ts > windowStart);

  const count = entry.timestamps.length;
  const allowed = count < config.limit;

  if (allowed) {
    entry.timestamps.push(now);
  }

  store.set(identifier, entry);

  return {
    allowed,
    remaining: Math.max(0, config.limit - count - (allowed ? 1 : 0)),
    resetAt: Date.now() + config.windowMs,
    limit: config.limit,
  };
}

/**
 * Reset rate limit counters for a given identifier (useful for testing).
 */
export function resetRateLimit(identifier?: string): void {
  if (identifier) {
    store.delete(identifier);
  } else {
    store.clear();
  }
}
