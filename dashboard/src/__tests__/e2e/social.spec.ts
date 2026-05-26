import { test, expect } from "@playwright/test";

test.describe("Social Automation", () => {
  test("redirects unauthenticated users from /dashboard/social to login", async ({ page }) => {
    await page.goto("/dashboard/social");
    await page.waitForURL("/login");
    await expect(page.locator('input[type="email"]')).toBeVisible();
  });

  test("handles URL with tab query param before redirecting to login", async ({ page }) => {
    await page.goto("/dashboard/social?tab=connections");
    await page.waitForURL("/login");
    await expect(page.locator('input[type="email"]')).toBeVisible();
  });
});
