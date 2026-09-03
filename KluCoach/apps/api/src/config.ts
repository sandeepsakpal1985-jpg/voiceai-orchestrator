import { config as loadEnv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

loadEnv({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../.env") });

export const APP_ENVS = ["development", "test", "demo", "production"] as const;
export type AppEnv = (typeof APP_ENVS)[number];
export const PAYMENT_PROVIDERS = ["none", "razorpay", "test"] as const;
export type PaymentProviderName = (typeof PAYMENT_PROVIDERS)[number];

const WEAK_SECRETS = new Set([
  "dev-only-change-me",
  "change-me-to-a-long-random-string-at-least-32-chars",
  "change-me-in-production-please-use-a-long-secret",
]);

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export type AppConfig = {
  nodeEnv: string;
  appEnv: AppEnv;
  isTest: boolean;
  isProduction: boolean;
  host: string;
  port: number;
  databaseUrl: string;
  sessionSecret: string;
  cookieSecure: boolean;
  cookieDomain: string | undefined;
  publicAppUrl: string;
  appBaseUrl: string;
  corsOrigins: string[];
  fileStorageDir: string;
  storageProvider: "local" | "s3";
  sessionDays: number;
  logLevel: string;
  paymentsEnabled: boolean;
  paymentProvider: PaymentProviderName;
  razorpayKeyId: string;
  razorpayKeySecret: string;
  paymentWebhookSecret: string;
  allowDevResetToken: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  smtpFrom: string;
  smtpSecure: boolean;
  s3Endpoint: string;
  s3Bucket: string;
  s3Region: string;
  s3AccessKey: string;
  s3SecretKey: string;
};

function asAppEnv(raw: string | undefined, nodeEnv: string): AppEnv {
  if (raw && (APP_ENVS as readonly string[]).includes(raw)) return raw as AppEnv;
  if (nodeEnv === "test") return "test";
  if (nodeEnv === "production") return "production";
  return "development";
}

function asPaymentProvider(raw: string | undefined): PaymentProviderName {
  if (raw && (PAYMENT_PROVIDERS as readonly string[]).includes(raw)) return raw as PaymentProviderName;
  return "none";
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const nodeEnv = env.NODE_ENV ?? "development";
  const appEnv = asAppEnv(env.APP_ENV, nodeEnv);
  const publicAppUrl = env.PUBLIC_APP_URL ?? env.APP_BASE_URL ?? "http://localhost:5173";
  return {
    nodeEnv,
    appEnv,
    isTest: env.VITEST === "true" || nodeEnv === "test" || appEnv === "test",
    isProduction: appEnv === "production",
    host: env.API_HOST ?? "0.0.0.0",
    port: Number(env.API_PORT ?? 3000),
    databaseUrl: env.DATABASE_URL ?? "",
    sessionSecret: env.SESSION_SECRET ?? "dev-only-change-me",
    cookieSecure: env.COOKIE_SECURE === "true",
    cookieDomain: env.COOKIE_DOMAIN || undefined,
    publicAppUrl,
    appBaseUrl: env.APP_BASE_URL ?? publicAppUrl,
    corsOrigins: (env.API_CORS_ORIGINS ?? "http://localhost:5173")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    fileStorageDir: env.FILE_STORAGE_DIR ?? "./data/files",
    storageProvider: env.STORAGE_PROVIDER === "s3" ? "s3" : "local",
    sessionDays: 7,
    logLevel: env.LOG_LEVEL ?? "info",
    paymentsEnabled: env.PAYMENTS_ENABLED === "true",
    paymentProvider: asPaymentProvider(env.PAYMENT_PROVIDER),
    razorpayKeyId: env.RAZORPAY_KEY_ID ?? "",
    razorpayKeySecret: env.RAZORPAY_KEY_SECRET ?? "",
    paymentWebhookSecret: env.PAYMENT_WEBHOOK_SECRET ?? "",
    allowDevResetToken: env.ALLOW_DEV_RESET_TOKEN === "true",
    smtpHost: env.SMTP_HOST ?? "",
    smtpPort: Number(env.SMTP_PORT ?? 587),
    smtpUser: env.SMTP_USER ?? "",
    smtpPass: env.SMTP_PASS ?? "",
    smtpFrom: env.SMTP_FROM ?? "KluCoach <noreply@localhost>",
    smtpSecure: env.SMTP_SECURE === "true",
    s3Endpoint: env.S3_ENDPOINT ?? "",
    s3Bucket: env.S3_BUCKET ?? "",
    s3Region: env.S3_REGION ?? "ap-south-1",
    s3AccessKey: env.S3_ACCESS_KEY_ID ?? "",
    s3SecretKey: env.S3_SECRET_ACCESS_KEY ?? "",
  };
}

export function validateConfig(cfg: AppConfig): void {
  if (!cfg.databaseUrl) {
    throw new ConfigError("DATABASE_URL is required");
  }
  if (cfg.isProduction) {
    if (cfg.sessionSecret.length < 32 || WEAK_SECRETS.has(cfg.sessionSecret)) {
      throw new ConfigError("SESSION_SECRET must be a unique value of at least 32 characters");
    }
    if (!cfg.cookieSecure) {
      throw new ConfigError("COOKIE_SECURE=true is required in production");
    }
    if (!cfg.publicAppUrl.startsWith("https://") && !cfg.publicAppUrl.startsWith("http://127.0.0.1")) {
      throw new ConfigError("PUBLIC_APP_URL / APP_BASE_URL must be https in production");
    }
    if (cfg.allowDevResetToken) {
      throw new ConfigError("ALLOW_DEV_RESET_TOKEN cannot be enabled in production");
    }
    if (cfg.paymentProvider === "test") {
      throw new ConfigError("PAYMENT_PROVIDER=test is not allowed in production");
    }
    if (cfg.paymentsEnabled) {
      if (cfg.paymentProvider !== "razorpay") {
        throw new ConfigError("PAYMENTS_ENABLED requires PAYMENT_PROVIDER=razorpay in production");
      }
      if (!cfg.razorpayKeyId || !cfg.razorpayKeySecret || !cfg.paymentWebhookSecret) {
        throw new ConfigError("RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, and PAYMENT_WEBHOOK_SECRET are required when payments are enabled");
      }
    }
  }
}

export function healthPayload(cfg: AppConfig) {
  return {
    status: "ok" as const,
    appEnv: cfg.appEnv,
    paymentsEnabled: cfg.paymentsEnabled,
    paymentProvider: cfg.paymentsEnabled ? cfg.paymentProvider : "none",
  };
}

export const config = loadConfig();
