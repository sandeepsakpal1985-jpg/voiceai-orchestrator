import { type Page, expect } from "@playwright/test";

export const DEMO_PASSWORD = "DemoPassw0rd!";

export async function loginAs(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: "Continue" }).click();
}

export async function expectHeading(page: Page, name: string | RegExp) {
  await expect(page.getByRole("heading", { name })).toBeVisible({ timeout: 15000 });
}
