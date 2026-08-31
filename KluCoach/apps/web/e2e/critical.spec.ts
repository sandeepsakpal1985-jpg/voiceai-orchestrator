import { expect, test } from "@playwright/test";

test("parent login shows child snapshot", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("parent@example.test");
  await page.getByLabel("Password").fill("DemoPassw0rd!");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: /Aarav/ })).toBeVisible({ timeout: 15000 });
  await expect(page.locator(".card .label", { hasText: "Attendance" })).toBeVisible();
});

test("admin login shows institute snapshot", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("admin@example.test");
  await page.getByLabel("Password").fill("DemoPassw0rd!");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Institute snapshot" })).toBeVisible();
  await expect(page.getByText("Parents activated")).toBeVisible();
});

test("student sees timetable after login", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("student@example.test");
  await page.getByLabel("Password").fill("DemoPassw0rd!");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("link", { name: "Timetable" }).click();
  await expect(page.getByRole("heading", { name: "Timetable" })).toBeVisible();
});
