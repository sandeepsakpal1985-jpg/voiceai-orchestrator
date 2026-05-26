import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  checkRateLimit,
  resetRateLimit,
  getConfigForRoute,
  DEFAULT_CONFIG,
  AUTH_CONFIG,
  WEBHOOK_CONFIG,
  MONITORING_CONFIG,
} from "@/lib/rate-limiter";

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Call checkRateLimit multiple times in rapid succession.
 * Returns the result of the last call.
 */
function fireRequests(identifier: string, count: number, config = DEFAULT_CONFIG) {
  let result;
  for (let i = 0; i < count; i++) {
    result = checkRateLimit(identifier, config);
  }
  return result!;
}

// ── Basic Behavior ─────────────────────────────────────────────────────────

describe("checkRateLimit", () => {
  beforeEach(() => {
    resetRateLimit();
  });

  it("allows the first request", () => {
    const result = checkRateLimit("127.0.0.1");
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(DEFAULT_CONFIG.limit - 1);
    expect(result.limit).toBe(DEFAULT_CONFIG.limit);
  });

  it("blocks requests exceeding the limit", () => {
    const identifier = "test-client";
    // Exhaust the limit
    fireRequests(identifier, DEFAULT_CONFIG.limit, DEFAULT_CONFIG);

    // Next request should be blocked
    const result = checkRateLimit(identifier, DEFAULT_CONFIG);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("tracks remaining count correctly", () => {
    const identifier = "remaining-test";

    const r1 = checkRateLimit(identifier, { limit: 5, windowMs: 60_000 });
    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(4);

    const r2 = checkRateLimit(identifier, { limit: 5, windowMs: 60_000 });
    expect(r2.allowed).toBe(true);
    expect(r2.remaining).toBe(3);

    fireRequests(identifier, 3, { limit: 5, windowMs: 60_000 });

    const rLast = checkRateLimit(identifier, { limit: 5, windowMs: 60_000 });
    expect(rLast.allowed).toBe(false);
    expect(rLast.remaining).toBe(0);
  });

  it("returns a future resetAt timestamp", () => {
    const before = Date.now();
    const result = checkRateLimit("reset-test", { limit: 1, windowMs: 10_000 });
    expect(result.resetAt).toBeGreaterThanOrEqual(before + 10_000);
  });

  it("uses default config when none provided", () => {
    const result = checkRateLimit("default-config");
    expect(result.limit).toBe(DEFAULT_CONFIG.limit);
  });
});

// ── Sliding Window ─────────────────────────────────────────────────────────

describe("sliding window behavior", () => {
  beforeEach(() => {
    resetRateLimit();
  });

  it("allows requests after the window expires (fake timers)", () => {
    vi.useFakeTimers();

    const identifier = "window-expire";
    const shortWindow = { limit: 2, windowMs: 50_000 }; // 50s window

    // Exhaust the limit
    fireRequests(identifier, 2, shortWindow);
    expect(checkRateLimit(identifier, shortWindow).allowed).toBe(false);

    // Advance time past the window
    vi.advanceTimersByTime(51_000);

    // New request should be allowed (window has expired)
    const result = checkRateLimit(identifier, shortWindow);
    expect(result.allowed).toBe(true);

    vi.useRealTimers();
  });

  it("slides the window — old requests drop off", () => {
    vi.useFakeTimers();

    const identifier = "slide";
    const windowMs = 10_000; // 10s window
    const config = { limit: 3, windowMs };

    // t=0: first request
    const r1 = checkRateLimit(identifier, config);
    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(2);

    // Advance 6s — second request (t=6s)
    vi.advanceTimersByTime(6000);
    const r2 = checkRateLimit(identifier, config);
    expect(r2.allowed).toBe(true);
    expect(r2.remaining).toBe(1);

    // Immediate third request (t=6s)
    const r3 = checkRateLimit(identifier, config);
    expect(r3.allowed).toBe(true);
    expect(r3.remaining).toBe(0);

    // Fourth request (t=6s) — blocked, at limit
    const r4 = checkRateLimit(identifier, config);
    expect(r4.allowed).toBe(false);
    expect(r4.remaining).toBe(0);

    // Advance 5s — total t=11s. First request (t=0) has dropped off (11-10=1, 0<1).
    // Requests at t=6s, t=6s remain (6>=1). Count = 2.
    vi.advanceTimersByTime(5000);
    const r5 = checkRateLimit(identifier, config);
    expect(r5.allowed).toBe(true);
    expect(r5.remaining).toBe(0); // limit - 2 - 1 = 0

    vi.useRealTimers();
  });

  it("handles rapid bursts correctly", () => {
    const identifier = "burst";
    const config = { limit: 100, windowMs: 60_000 };

    // Fire 100 requests — all allowed
    for (let i = 0; i < 100; i++) {
      const r = checkRateLimit(identifier, config);
      expect(r.allowed).toBe(true);
    }

    // 101st should be blocked
    expect(checkRateLimit(identifier, config).allowed).toBe(false);

    // Reset and verify
    resetRateLimit(identifier);
    expect(checkRateLimit(identifier, config).allowed).toBe(true);
  });
});

// ── Per-identifier isolation ───────────────────────────────────────────────

describe("per-identifier isolation", () => {
  beforeEach(() => {
    resetRateLimit();
  });

  it("tracks identifiers independently", () => {
    const config = { limit: 3, windowMs: 60_000 };

    // Exhaust "ip-A"
    fireRequests("ip-A", 3, config);
    expect(checkRateLimit("ip-A", config).allowed).toBe(false);

    // "ip-B" should still be allowed
    expect(checkRateLimit("ip-B", config).allowed).toBe(true);
  });

  it("resets a specific identifier without affecting others", () => {
    const config = { limit: 2, windowMs: 60_000 };

    fireRequests("ip-A", 2, config);
    fireRequests("ip-B", 2, config);

    resetRateLimit("ip-A");

    expect(checkRateLimit("ip-A", config).allowed).toBe(true);
    expect(checkRateLimit("ip-B", config).allowed).toBe(false);
  });

  it("resets all identifiers", () => {
    const config = { limit: 1, windowMs: 60_000 };

    fireRequests("ip-A", 1, config);
    fireRequests("ip-B", 1, config);
    fireRequests("ip-C", 1, config);

    resetRateLimit(); // clear all

    expect(checkRateLimit("ip-A", config).allowed).toBe(true);
    expect(checkRateLimit("ip-B", config).allowed).toBe(true);
    expect(checkRateLimit("ip-C", config).allowed).toBe(true);
  });
});

// ── Route Config Resolution ────────────────────────────────────────────────

describe("getConfigForRoute", () => {
  it("returns default config for unrecognized routes", () => {
    const config = getConfigForRoute("/api/calls");
    expect(config).toBe(DEFAULT_CONFIG);
  });

  it("returns auth config for auth routes", () => {
    const config = getConfigForRoute("/api/auth/login");
    expect(config).toBe(AUTH_CONFIG);
    expect(config.limit).toBe(10);
  });

  it("returns auth config for ws-token route", () => {
    const config = getConfigForRoute("/api/ws-token");
    expect(config).toBe(AUTH_CONFIG);
  });

  it("returns webhook config for webhook routes", () => {
    const config = getConfigForRoute("/api/webhooks/twilio");
    expect(config).toBe(WEBHOOK_CONFIG);
    expect(config.limit).toBe(200);
  });

  it("returns monitoring config for monitoring route", () => {
    const config = getConfigForRoute("/api/monitoring");
    expect(config).toBe(MONITORING_CONFIG);
    expect(config.limit).toBe(30);
  });

  it("matches routes with nested paths", () => {
    const config = getConfigForRoute("/api/auth/register");
    expect(config).toBe(AUTH_CONFIG);
  });

  it("matches webhook nested paths", () => {
    const config = getConfigForRoute("/api/webhooks/twilio/status");
    expect(config).toBe(WEBHOOK_CONFIG);
  });

  it("returns default config for non-api routes", () => {
    // Non-api paths won't reach this function in practice (middleware filters them)
    // but the function should still return a sensible default
    const config = getConfigForRoute("/dashboard");
    expect(config).toBe(DEFAULT_CONFIG);
  });
});

// ── Edge Cases ─────────────────────────────────────────────────────────────

describe("edge cases", () => {
  beforeEach(() => {
    resetRateLimit();
  });

  it("handles empty string identifier", () => {
    const result = checkRateLimit("");
    expect(result.allowed).toBe(true);
  });

  it("handles very long identifier string", () => {
    const longId = "a".repeat(10_000);
    const result = checkRateLimit(longId);
    expect(result.allowed).toBe(true);
  });

  it("handles limit of 0 (block everything)", () => {
    const result = checkRateLimit("block-all", { limit: 0, windowMs: 60_000 });
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("handles limit of 1", () => {
    const config = { limit: 1, windowMs: 60_000 };
    expect(checkRateLimit("single", config).allowed).toBe(true);
    expect(checkRateLimit("single", config).allowed).toBe(false);
  });

  it("handles negative limit gracefully", () => {
    const result = checkRateLimit("negative", { limit: -1, windowMs: 60_000 });
    // With limit -1, count (0) < -1 is false, so denied
    expect(result.allowed).toBe(false);
  });
});
