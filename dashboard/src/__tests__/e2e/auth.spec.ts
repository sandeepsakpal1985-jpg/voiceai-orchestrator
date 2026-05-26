import { test, expect } from "@playwright/test";

test.describe("Authentication", () => {
  test("login page loads with form fields", async ({ page }) => {
    await page.goto("/login");

    // Title should be present
    await expect(page).toHaveTitle(/Sign In/);

    // Form fields should be visible
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();

    // Submit button should be present
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
  });

  test("redirects to login when unauthenticated", async ({ page }) => {
    await page.goto("/");
    await page.waitForURL("/login");
    await expect(page.locator('input[type="email"]')).toBeVisible();
  });

  test("browser validation blocks empty form submission", async ({ page }) => {
    await page.goto("/login");
    const currentUrl = page.url();
    await page.getByRole("button", { name: /sign in/i }).click();
    // HTML5 validation should block submission — URL should not change
    await expect(page).toHaveURL(currentUrl);
  });
});
