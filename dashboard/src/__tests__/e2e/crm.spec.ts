import { test, expect } from "@playwright/test";

test.describe("CRM Pipeline", () => {
  test("redirects unauthenticated users from /dashboard/crm to login", async ({ page }) => {
    await page.goto("/dashboard/crm");
    await page.waitForURL("/login");
    await expect(page.locator('input[type="email"]')).toBeVisible();
  });

  test("handles URL with pipeline query params before redirecting to login", async ({ page }) => {
    await page.goto("/dashboard/crm?pipeline=sales&stage=qualified");
    await page.waitForURL("/login");
    await expect(page.locator('input[type="email"]')).toBeVisible();
  });
});
