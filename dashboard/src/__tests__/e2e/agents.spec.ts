import { test, expect } from "@playwright/test";

test.describe("Agent Builder", () => {
  test("redirects unauthenticated users from /dashboard/agents to login", async ({ page }) => {
    await page.goto("/dashboard/agents");
    await page.waitForURL("/login");
    await expect(page.locator('input[type="email"]')).toBeVisible();
  });

  test("handles URL with query params before redirecting to login", async ({ page }) => {
    await page.goto("/dashboard/agents?tab=voice");
    await page.waitForURL("/login");
    await expect(page.locator('input[type="email"]')).toBeVisible();
  });
});
