import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  retries: 0,
  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "pnpm --filter @klucoach/api dev",
      url: "http://localhost:3100/health",
      reuseExistingServer: true,
      timeout: 180_000,
      cwd: "../..",
      env: {
        ...process.env,
        PAYMENTS_ENABLED: "true",
        PAYMENT_PROVIDER: "test",
        PAYMENT_WEBHOOK_SECRET: "test-webhook-secret",
        ALLOW_DEV_RESET_TOKEN: "true",
        AI_ENABLED: "true",
        AI_PROVIDER: "test",
      },
    },
    {
      command: "pnpm --filter @klucoach/web dev",
      url: "http://localhost:5173",
      reuseExistingServer: true,
      timeout: 180_000,
      cwd: "../..",
    },
  ],
});
