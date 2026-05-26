import { test, expect } from "@playwright/test";

const DEMO_EMAIL = "demo@example.com";
const DEMO_PASSWORD = "password123";

test.describe("System Monitoring", () => {
  test("redirects unauthenticated users from /monitoring to login", async ({ page }) => {
    await page.goto("/monitoring");
    await page.waitForURL("/login");
    await expect(page.locator('input[type="email"]')).toBeVisible();
  });

  test("monitoring page loads with health cards when authenticated", async ({ page }) => {
    // Log in with demo credentials
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    await page.fill('input[type="email"]', DEMO_EMAIL);
    await page.fill('input[type="password"]', DEMO_PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();

    // Wait for redirect post-login
    await page.waitForURL(/\/dashboard/, { timeout: 30000 });

    // Navigate to monitoring
    await page.goto("/monitoring");
    await page.waitForLoadState("networkidle");

    // Verify page title
    await expect(page.locator("h1")).toContainText(/system monitoring/i);

    // Verify health metric cards
    await expect(page.getByText(/total requests/i)).toBeVisible();
    await expect(page.getByText(/error rate/i)).toBeVisible();
    await expect(page.getByText(/websocket clients/i)).toBeVisible();
    await expect(page.getByText(/memory/i)).toBeVisible();
  });

  test("has action buttons for refresh and reset", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    await page.fill('input[type="email"]', DEMO_EMAIL);
    await page.fill('input[type="password"]', DEMO_PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 30000 });

    await page.goto("/monitoring");
    await page.waitForLoadState("networkidle");

    // Verify action buttons
    await expect(page.getByRole("button", { name: /auto/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /refresh/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /reset/i })).toBeVisible();
  });

  test("has all content tabs (routes, duration, logs)", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    await page.fill('input[type="email"]', DEMO_EMAIL);
    await page.fill('input[type="password"]', DEMO_PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 30000 });

    await page.goto("/monitoring");
    await page.waitForLoadState("networkidle");

    // Verify all 3 tabs
    await expect(page.getByRole("tab", { name: /routes/i })).toBeVisible();
    await expect(page.getByRole("tab", { name: /duration/i })).toBeVisible();
    await expect(page.getByRole("tab", { name: /logs/i })).toBeVisible();
  });

  test("navigates to logs tab and verifies log display", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    await page.fill('input[type="email"]', DEMO_EMAIL);
    await page.fill('input[type="password"]', DEMO_PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 30000 });

    await page.goto("/monitoring");
    await page.waitForLoadState("networkidle");

    // Click logs tab
    await page.getByRole("tab", { name: /logs/i }).click();
    await page.waitForTimeout(500);

    // Verify log entries section
    await expect(page.getByText(/entries/i)).toBeVisible();
  });
});
