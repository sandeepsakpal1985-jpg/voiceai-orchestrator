import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
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
      cwd: "../..",
    },
    {
      command: "pnpm --filter @klucoach/web dev",
      url: "http://localhost:5173",
      reuseExistingServer: true,
      cwd: "../..",
    },
  ],
});
