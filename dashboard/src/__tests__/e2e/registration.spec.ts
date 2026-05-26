import { test, expect } from "@playwright/test";

test.describe("Registration", () => {
  test("registration page loads with all form fields", async ({ page }) => {
    await page.goto("/register");

    // Title should be present
    await expect(page).toHaveTitle(/VoiceAI/);

    // All form fields should be visible
    await expect(page.locator("#name")).toBeVisible();
    await expect(page.locator("#companyName")).toBeVisible();
    await expect(page.locator("#email")).toBeVisible();
    await expect(page.locator("#password")).toBeVisible();

    // Submit button should be present
    await expect(page.getByRole("button", { name: /create account/i })).toBeVisible();

    // Should have a link to sign in
    await expect(page.getByRole("link", { name: /sign in/i })).toBeVisible();
  });

  test("has link to login page for existing users", async ({ page }) => {
    await page.goto("/register");

    // Click "Sign in" link should navigate to login
    await page.getByRole("link", { name: /sign in/i }).click();
    await page.waitForURL("/login");
    await expect(page.locator("#email")).toBeVisible();
  });

  test("browser validation blocks empty registration form", async ({ page }) => {
    await page.goto("/register");
    const currentUrl = page.url();

    // Click submit without filling any fields
    await page.getByRole("button", { name: /create account/i }).click();

    // HTML5 validation should block submission — URL should not change
    await expect(page).toHaveURL(currentUrl);
  });

  test("browser validation requires valid email format", async ({ page }) => {
    await page.goto("/register");

    // Fill fields but with invalid email
    await page.locator("#name").fill("Test User");
    await page.locator("#email").fill("not-an-email");
    await page.locator("#password").fill("password123");

    // Try to submit — browser validation should catch invalid email
    await page.getByRole("button", { name: /create account/i }).click();

    // URL should not change (validation blocked)
    await expect(page).toHaveURL(/\/register/);
  });
});
