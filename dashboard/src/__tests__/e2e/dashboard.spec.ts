import { test, expect } from "@playwright/test";

test.describe("Dashboard Authentication Guard", () => {
  const protectedRoutes = [
    "/dashboard",
    "/analytics",
    "/call-history",
    "/campaigns",
    "/settings",
    "/billing",
    "/dashboard/agents",
    "/dashboard/crm",
    "/dashboard/social",
    "/dashboard/knowledge-base",
  ];

  for (const route of protectedRoutes) {
    test(`redirects unauthenticated users from ${route} to login`, async ({ page }) => {
      await page.goto(route);
      // Should be redirected to login page
      await page.waitForURL("/login");
      await expect(page.locator("#email")).toBeVisible();
    });
  }

  test("redirects root path to login for unauthenticated users", async ({ page }) => {
    await page.goto("/");
    await page.waitForURL("/login");
    await expect(page.locator('input[type="email"]')).toBeVisible();
  });

  test("maintains login page for direct navigation", async ({ page }) => {
    await page.goto("/login");
    await expect(page).toHaveURL("/login");
    await expect(page.locator('h1')).toContainText(/welcome back/i);
  });

  test("maintains register page for direct navigation", async ({ page }) => {
    await page.goto("/register");
    await expect(page).toHaveURL("/register");
    await expect(page.locator('h1')).toContainText(/create an account/i);
  });
});
