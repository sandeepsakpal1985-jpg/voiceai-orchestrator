import { test, expect } from "@playwright/test";

const DEMO_EMAIL = "demo@example.com";
const DEMO_PASSWORD = "password123";

test.describe("Settings", () => {
  test("redirects unauthenticated users from /settings to login", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForURL("/login");
    await expect(page.locator('input[type="email"]')).toBeVisible();
  });

  test("handles URL with tab query param before redirecting to login", async ({ page }) => {
    await page.goto("/settings?tab=security");
    await page.waitForURL("/login");
    await expect(page.locator('input[type="email"]')).toBeVisible();
  });

  test("settings page loads with all tabs visible when authenticated", async ({ page }) => {
    // Log in with demo credentials
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    await page.fill('input[type="email"]', DEMO_EMAIL);
    await page.fill('input[type="password"]', DEMO_PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();

    // Wait for redirect post-login
    await page.waitForURL(/\/dashboard/, { timeout: 30000 });

    // Navigate to settings
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    // Verify page title
    await expect(page.locator("h1")).toContainText(/settings/i);

    // Verify all 4 tabs are present
    await expect(page.getByRole("tab", { name: /profile/i })).toBeVisible();
    await expect(page.getByRole("tab", { name: /notifications/i })).toBeVisible();
    await expect(page.getByRole("tab", { name: /security/i })).toBeVisible();
    await expect(page.getByRole("tab", { name: /api keys/i })).toBeVisible();
  });

  test("profile tab shows form fields", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    await page.fill('input[type="email"]', DEMO_EMAIL);
    await page.fill('input[type="password"]', DEMO_PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 30000 });

    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    // Profile tab is default - verify form fields
    await expect(page.locator("#name")).toBeVisible();
    await expect(page.locator("#email")).toBeVisible();
    await expect(page.locator("#company")).toBeVisible();
    await expect(page.locator("#phone")).toBeVisible();
    await expect(page.getByRole("button", { name: /save changes/i })).toBeVisible();
  });

  test("navigates between settings tabs", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    await page.fill('input[type="email"]', DEMO_EMAIL);
    await page.fill('input[type="password"]', DEMO_PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 30000 });

    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    // Click each tab and verify content changes
    await page.getByRole("tab", { name: /security/i }).click();
    await expect(page.locator("#current-password")).toBeVisible();
    await expect(page.getByText(/two-factor authentication/i)).toBeVisible();

    await page.getByRole("tab", { name: /notifications/i }).click();
    await expect(page.getByText(/call alerts/i)).toBeVisible();
    await expect(page.getByText(/usage reports/i)).toBeVisible();

    await page.getByRole("tab", { name: /api keys/i }).click();
    await expect(page.getByRole("button", { name: /generate new key/i })).toBeVisible();
  });
});
