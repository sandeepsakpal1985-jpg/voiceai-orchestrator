import { config as loadEnv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

loadEnv({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../.env") });

export const config = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  host: process.env.API_HOST ?? "0.0.0.0",
  port: Number(process.env.API_PORT ?? 3000),
  databaseUrl: process.env.DATABASE_URL ?? "",
  sessionSecret: process.env.SESSION_SECRET ?? "dev-only-change-me",
  cookieSecure: process.env.COOKIE_SECURE === "true",
  cookieDomain: process.env.COOKIE_DOMAIN || undefined,
  publicAppUrl: process.env.PUBLIC_APP_URL ?? "http://localhost:5173",
  corsOrigins: (process.env.API_CORS_ORIGINS ?? "http://localhost:5173")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  fileStorageDir: process.env.FILE_STORAGE_DIR ?? "./data/files",
  sessionDays: 7,
  logLevel: process.env.LOG_LEVEL ?? "info",
};
