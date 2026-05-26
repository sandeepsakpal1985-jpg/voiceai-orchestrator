import { test, expect } from "@playwright/test";

const DEMO_EMAIL = "demo@example.com";
const DEMO_PASSWORD = "password123";

test.describe("Call History", () => {
  test("redirects unauthenticated users from /call-history to login", async ({ page }) => {
    await page.goto("/call-history");
    await page.waitForURL("/login");
    await expect(page.locator('input[type="email"]')).toBeVisible();
  });

  test("call-history page loads with stats cards when authenticated", async ({ page }) => {
    // Log in with demo credentials
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    await page.fill('input[type="email"]', DEMO_EMAIL);
    await page.fill('input[type="password"]', DEMO_PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();

    // Wait for redirect post-login
    await page.waitForURL(/\/dashboard/, { timeout: 30000 });

    // Navigate to call history
    await page.goto("/call-history");
    await page.waitForLoadState("networkidle");

    // Verify page title
    await expect(page.locator("h1")).toContainText(/call history/i);

    // Verify stats cards
    await expect(page.getByText(/total calls/i)).toBeVisible();
    await expect(page.getByText(/completed/i)).toBeVisible();
    await expect(page.getByText(/failed/i)).toBeVisible();
    await expect(page.getByText(/avg duration/i)).toBeVisible();
  });

  test("call-history has search input and action buttons", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    await page.fill('input[type="email"]', DEMO_EMAIL);
    await page.fill('input[type="password"]', DEMO_PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 30000 });

    await page.goto("/call-history");
    await page.waitForLoadState("networkidle");

    // Verify search input
    await expect(page.getByPlaceholder(/search calls/i)).toBeVisible();

    // Verify action buttons
    await expect(page.getByRole("button", { name: /filters/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /export/i })).toBeVisible();
  });

  test("call-history table has all expected columns", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    await page.fill('input[type="email"]', DEMO_EMAIL);
    await page.fill('input[type="password"]', DEMO_PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 30000 });

    await page.goto("/call-history");
    await page.waitForLoadState("networkidle");

    // Verify table column headers
    await expect(page.getByText(/contact/i).first()).toBeVisible();
    await expect(page.getByText(/direction/i).first()).toBeVisible();
    await expect(page.getByText(/duration/i).first()).toBeVisible();
    await expect(page.getByText(/status/i).first()).toBeVisible();
    await expect(page.getByText(/cost/i).first()).toBeVisible();
    await expect(page.getByText(/date/i).first()).toBeVisible();
  });
});
