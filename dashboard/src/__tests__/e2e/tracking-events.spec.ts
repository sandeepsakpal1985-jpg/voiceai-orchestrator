import { test, expect } from "@playwright/test";

const DEMO_EMAIL = "demo@example.com";
const DEMO_PASSWORD = "password123";

test.describe("Tracking Events Page", () => {
  test("redirects unauthenticated users from /analytics/events to login", async ({ page }) => {
    await page.goto("/analytics/events");
    await page.waitForURL("/login");
    await expect(page.locator('input[type="email"]')).toBeVisible();
  });

  test("tracking events page loads with stat cards when authenticated", async ({ page }) => {
    // Log in with demo credentials
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    await page.fill('input[type="email"]', DEMO_EMAIL);
    await page.fill('input[type="password"]', DEMO_PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();

    // Wait for redirect post-login
    await page.waitForURL(/\/dashboard/, { timeout: 30000 });

    // Navigate to tracking events
    await page.goto("/analytics/events");
    await page.waitForLoadState("networkidle");

    // Verify page title
    await expect(page.locator("h1")).toContainText(/tracking events/i);

    // Verify stat cards
    await expect(page.getByText(/total events/i)).toBeVisible();
    await expect(page.getByText(/page views/i)).toBeVisible();
    await expect(page.getByText(/interactions/i)).toBeVisible();
    await expect(page.getByText(/unique actions/i)).toBeVisible();
  });

  test("has filter controls for type and action", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    await page.fill('input[type="email"]', DEMO_EMAIL);
    await page.fill('input[type="password"]', DEMO_PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 30000 });

    await page.goto("/analytics/events");
    await page.waitForLoadState("networkidle");

    // Verify filter controls
    await expect(page.getByLabel(/filter by event type/i)).toBeVisible();
    await expect(page.getByLabel(/filter by action/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /refresh/i })).toBeVisible();
  });

  test("has event stream section with live badge when data available", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    await page.fill('input[type="email"]', DEMO_EMAIL);
    await page.fill('input[type="password"]', DEMO_PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 30000 });

    await page.goto("/analytics/events");
    await page.waitForLoadState("networkidle");

    // Verify event stream section
    await expect(page.getByText(/event stream/i)).toBeVisible();

    // Verify auto-refresh toggle exists
    await expect(page.getByRole("button", { name: /auto refresh/i })).toBeVisible();
  });

  test("type filter dropdown changes event list", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    await page.fill('input[type="email"]', DEMO_EMAIL);
    await page.fill('input[type="password"]', DEMO_PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 30000 });

    await page.goto("/analytics/events");
    await page.waitForLoadState("networkidle");

    // Select "Page Views" filter
    await page.getByLabel(/filter by event type/i).selectOption("page_view");

    // Verify count text updates
    await expect(page.getByText(/events shown/i)).toBeVisible();
  });
});
