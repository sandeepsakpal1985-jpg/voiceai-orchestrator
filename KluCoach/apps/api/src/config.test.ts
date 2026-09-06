import { describe, expect, it } from "vitest";
import { assertDemoSeedAllowed } from "@klunex-edu/database";
import { healthPayload, loadConfig, validateConfig } from "./config.js";

function base(overrides: Record<string, string> = {}) {
  return {
    NODE_ENV: "production",
    APP_ENV: "production",
    DATABASE_URL: "postgresql://klucoach:secret@db:5432/klucoach",
    SESSION_SECRET: "a-sufficiently-long-production-session-secret-value",
    COOKIE_SECURE: "true",
    PUBLIC_APP_URL: "https://app.example.test",
    APP_BASE_URL: "https://app.example.test",
    PAYMENTS_ENABLED: "false",
    ...overrides,
  };
}

describe("production configuration validator", () => {
  it("accepts a complete production config with payments disabled", () => {
    const cfg = loadConfig(base());
    expect(() => validateConfig(cfg)).not.toThrow();
    expect(cfg.isProduction).toBe(true);
    expect(cfg.paymentsEnabled).toBe(false);
  });

  it("fails fast when SESSION_SECRET is weak", () => {
    const cfg = loadConfig(base({ SESSION_SECRET: "dev-only-change-me" }));
    expect(() => validateConfig(cfg)).toThrow(/SESSION_SECRET/);
  });

  it("fails fast when production payments are enabled without Razorpay secrets", () => {
    const cfg = loadConfig(base({ PAYMENTS_ENABLED: "true", PAYMENT_PROVIDER: "razorpay" }));
    expect(() => validateConfig(cfg)).toThrow(/RAZORPAY/);
  });

  it("rejects the test payment provider in production", () => {
    const cfg = loadConfig(base({ PAYMENT_PROVIDER: "test", PAYMENTS_ENABLED: "true" }));
    expect(() => validateConfig(cfg)).toThrow(/test/);
  });

  it("rejects wildcard CORS in production", () => {
    const cfg = loadConfig(base({ API_CORS_ORIGINS: "*" }));
    expect(() => validateConfig(cfg)).toThrow(/CORS/);
  });

  it("rejects insecure cookies in production", () => {
    const cfg = loadConfig(base({ COOKIE_SECURE: "false" }));
    expect(() => validateConfig(cfg)).toThrow(/COOKIE_SECURE/);
  });

  it("rejects dev reset-token escape hatch in production", () => {
    const cfg = loadConfig(base({ ALLOW_DEV_RESET_TOKEN: "true" }));
    expect(() => validateConfig(cfg)).toThrow(/ALLOW_DEV_RESET_TOKEN/);
  });

  it("does not put secrets on the health payload", () => {
    const cfg = loadConfig(base({ RAZORPAY_KEY_SECRET: "super-secret", SESSION_SECRET: "a-sufficiently-long-production-session-secret-value", AI_API_KEY: "sk-secret-ai" }));
    const body = JSON.stringify(healthPayload(cfg));
    expect(body).not.toContain("super-secret");
    expect(body).not.toContain("sk-secret-ai");
    expect(body).not.toContain(cfg.sessionSecret);
    expect(body).not.toContain(cfg.databaseUrl);
  });

  it("allows production to boot with AI disabled and no API key", () => {
    const cfg = loadConfig(base({ AI_ENABLED: "false" }));
    expect(() => validateConfig(cfg)).not.toThrow();
    expect(cfg.aiEnabled).toBe(false);
  });

  it("fails fast when production AI is enabled without a key", () => {
    const cfg = loadConfig(base({ AI_ENABLED: "true", AI_PROVIDER: "openai" }));
    expect(() => validateConfig(cfg)).toThrow(/AI_API_KEY/);
  });

  it("rejects the test AI provider in production when AI is enabled", () => {
    const cfg = loadConfig(base({ AI_ENABLED: "true", AI_PROVIDER: "test", AI_API_KEY: "sk-not-used" }));
    expect(() => validateConfig(cfg)).toThrow(/AI_PROVIDER/);
  });

  it("refuses demo seed when APP_ENV is production", () => {
    expect(() => assertDemoSeedAllowed({ APP_ENV: "production" })).toThrow(/demo data/);
    expect(() => assertDemoSeedAllowed({ NODE_ENV: "production" })).toThrow(/demo data/);
    expect(() => assertDemoSeedAllowed({ APP_ENV: "development", NODE_ENV: "development" })).not.toThrow();
  });
});
