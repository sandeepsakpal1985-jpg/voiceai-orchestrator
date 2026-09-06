import { expect, test } from "@playwright/test";
import { DEMO_PASSWORD, expectHeading, loginAs } from "./helpers";

test("admin can invite a parent who then sees only their child", async ({ page, browser }) => {
  const stamp = Date.now();
  const firstName = `Kian${stamp.toString().slice(-4)}`;
  const admission = `E2E-${stamp}`;
  const email = `parent.e2e.${stamp}@example.test`;

  await loginAs(page, "admin@example.test");
  await expectHeading(page, "Institute snapshot");
  await page.getByRole("link", { name: "Students", exact: true }).click();
  await expectHeading(page, "Students");

  await page.getByLabel("First name").fill(firstName);
  await page.getByLabel("Last name").fill("Mehta");
  await page.getByLabel("Admission number").fill(admission);
  await expect(page.locator("#student-branch")).toHaveValue(/.+/, { timeout: 15000 });
  await page.getByLabel("Guardian name").fill("Rina Mehta");
  await page.getByLabel("Guardian email").fill(email);
  await page.getByRole("button", { name: "Create student" }).click();

  await expectHeading(page, new RegExp(firstName));
  await page.getByLabel("Invitation email").fill(email);
  await page.getByRole("button", { name: "Create invitation" }).click();
  const link = page.getByTestId("invite-accept-url");
  await expect(link).toHaveValue(/accept-invite\?token=/);
  const acceptUrl = await link.inputValue();

  const parentCtx = await browser.newContext();
  const parentPage = await parentCtx.newPage();
  await parentPage.goto(acceptUrl);
  await parentPage.getByLabel("First name").fill("Rina");
  await parentPage.getByLabel("Last name").fill("Mehta");
  await parentPage.getByLabel("Password").fill("InvitePassw0rd!");
  await parentPage.getByRole("button", { name: "Activate" }).click();
  await expectHeading(parentPage, new RegExp(firstName));
  await expect(parentPage.getByText("O-1001")).toHaveCount(0);

  await parentPage.goto("/parent?studentId=not-a-real-child");
  await expect(parentPage.getByText(/not found/i)).toBeVisible({ timeout: 15000 });

  await parentPage.goto(acceptUrl);
  await parentPage.getByLabel("First name").fill("Rina");
  await parentPage.getByLabel("Last name").fill("Mehta");
  await parentPage.getByLabel("Password").fill("InvitePassw0rd!");
  await parentPage.getByRole("button", { name: "Activate" }).click();
  await expect(parentPage.locator(".err")).toBeVisible();

  await parentCtx.close();
});

test("invalid invitation token is rejected", async ({ page }) => {
  await page.goto("/accept-invite?token=aaaaaaaaaaaaaaaaaaaa");
  await page.getByLabel("First name").fill("Nope");
  await page.getByLabel("Last name").fill("Nope");
  await page.getByLabel("Password").fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: "Activate" }).click();
  await expect(page.locator(".err")).toBeVisible();
});
