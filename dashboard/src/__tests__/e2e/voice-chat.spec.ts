import { test, expect } from "@playwright/test";

const DEMO_EMAIL = "demo@example.com";
const DEMO_PASSWORD = "password123";

test.describe("Voice Chat", () => {
  test("login page loads with form fields", async ({ page }) => {
    await page.goto("/login");
    await expect(page).toHaveTitle(/Sign In/);
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });

  test("voice-chat page loads with all UI components visible", async ({ page }) => {
    // Log in with demo credentials
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    await page.fill('input[type="email"]', DEMO_EMAIL);
    await page.fill('input[type="password"]', DEMO_PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();

    // Wait for redirect to dashboard (credential auth can be slow with bcrypt)
    await page.waitForURL(/\/dashboard/, { timeout: 30000 });

    // Verify login succeeded — wait for dashboard content to load (API calls may take time)
    await expect(page.getByText("Dashboard").first()).toBeVisible({ timeout: 15000 });

    // Navigate to voice-chat
    await page.goto("/voice-chat");
    await page.waitForLoadState("networkidle");

    // Verify page title
    await expect(page.locator("h1")).toContainText(/voice chat/i);

    // Verify voice chat widget is present — look for the Start Call button
    const startCallButton = page.getByRole("button", { name: /start call/i });
    await expect(startCallButton).toBeVisible({ timeout: 5000 });

    // Verify pipeline status card shows expected providers
    await expect(page.getByText(/STT: whisper/i)).toBeVisible();
    await expect(page.getByText(/LLM: openai/i)).toBeVisible();

    // Verify WebSocket status is shown
    await expect(page.getByText(/orchestrator/i)).toBeVisible();
    await expect(page.getByText(/Idle|Running/i)).toBeVisible();

    // Verify the AI Voice Agent card header
    await expect(page.getByText(/AI Voice Agent/i)).toBeVisible();

    // Verify configuration sidebar
    await expect(page.getByText(/how it works/i)).toBeVisible();
    await expect(page.getByText(/pipeline status/i)).toBeVisible();
  });

  test("redirects to login when unauthenticated", async ({ page }) => {
    await page.goto("/voice-chat");
    await page.waitForURL(/\/login/);
    await expect(page.locator('input[type="email"]')).toBeVisible();
  });
});
