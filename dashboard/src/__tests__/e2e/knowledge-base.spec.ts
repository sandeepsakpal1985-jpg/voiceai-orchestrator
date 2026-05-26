import { test, expect } from "@playwright/test";

const DEMO_EMAIL = "demo@example.com";
const DEMO_PASSWORD = "password123";

test.describe("Knowledge Base", () => {
  test("redirects unauthenticated users from /knowledge-base to login", async ({ page }) => {
    await page.goto("/knowledge-base");
    await page.waitForURL("/login");
    await expect(page.locator('input[type="email"]')).toBeVisible();
  });

  test("knowledge-base page loads with all UI components when authenticated", async ({ page }) => {
    // Log in with demo credentials
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    await page.fill('input[type="email"]', DEMO_EMAIL);
    await page.fill('input[type="password"]', DEMO_PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();

    // Wait for redirect post-login
    await page.waitForURL(/\/dashboard/, { timeout: 30000 });

    // Navigate to knowledge base
    await page.goto("/knowledge-base");
    await page.waitForLoadState("networkidle");

    // Verify page title
    await expect(page.locator("h1")).toContainText(/knowledge base/i);

    // Verify upload button is visible
    await expect(page.getByRole("button", { name: /upload/i })).toBeVisible();

    // Verify stats cards are present
    await expect(page.getByText(/total documents/i)).toBeVisible();
    await expect(page.getByText(/indexed/i)).toBeVisible();
    await expect(page.getByText(/processing/i)).toBeVisible();
    await expect(page.getByText(/failed/i)).toBeVisible();

    // Verify drop zone
    await expect(page.getByText(/drop files here/i)).toBeVisible();
  });

  test("has all content tabs visible", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    await page.fill('input[type="email"]', DEMO_EMAIL);
    await page.fill('input[type="password"]', DEMO_PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 30000 });

    await page.goto("/knowledge-base");
    await page.waitForLoadState("networkidle");

    // Verify all 3 content tabs
    await expect(page.getByRole("tab", { name: /documents/i })).toBeVisible();
    await expect(page.getByRole("tab", { name: /semantic search/i })).toBeVisible();
    await expect(page.getByRole("tab", { name: /index text/i })).toBeVisible();
  });

  test("semantic search tab has search input and button", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    await page.fill('input[type="email"]', DEMO_EMAIL);
    await page.fill('input[type="password"]', DEMO_PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 30000 });

    await page.goto("/knowledge-base");
    await page.waitForLoadState("networkidle");

    // Switch to semantic search tab
    await page.getByRole("tab", { name: /semantic search/i }).click();
    await page.waitForTimeout(500);

    // Verify search input and button
    await expect(page.getByPlaceholder(/ask a question/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /search/i })).toBeVisible();
  });

  test("index text tab has textarea and index button", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    await page.fill('input[type="email"]', DEMO_EMAIL);
    await page.fill('input[type="password"]', DEMO_PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 30000 });

    await page.goto("/knowledge-base");
    await page.waitForLoadState("networkidle");

    // Switch to index text tab
    await page.getByRole("tab", { name: /index text/i }).click();
    await page.waitForTimeout(500);

    // Verify textarea and index button
    await expect(page.getByPlaceholder(/paste your content/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /index content/i })).toBeVisible();
  });
});
