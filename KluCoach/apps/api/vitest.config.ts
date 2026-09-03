import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    fileParallelism: false,
    hookTimeout: 120000,
    testTimeout: 60000,
    env: {
      PAYMENTS_ENABLED: "true",
      PAYMENT_PROVIDER: "test",
      PAYMENT_WEBHOOK_SECRET: "test-webhook-secret",
      ALLOW_DEV_RESET_TOKEN: "true",
    },
  },
});
