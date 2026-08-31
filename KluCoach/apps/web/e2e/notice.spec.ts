import { expect, test } from "@playwright/test";

test("teacher can publish a notice and parent can see it", async ({ page, browser }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("teacher@example.test");
  await page.getByLabel("Password").fill("DemoPassw0rd!");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("link", { name: "Notices" }).click();
  await expect(page.getByRole("heading", { name: "Notices" })).toBeVisible();
  const title = `Lab closed ${Date.now()}`;
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Message").fill("Physics lab is closed tomorrow.");
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByText(title)).toBeVisible();

  const parentCtx = await browser.newContext();
  const parent = await parentCtx.newPage();
  await parent.goto("/login");
  await parent.getByLabel("Email").fill("parent@example.test");
  await parent.getByLabel("Password").fill("DemoPassw0rd!");
  await parent.getByRole("button", { name: "Continue" }).click();
  await parent.getByRole("link", { name: "Notices" }).click();
  await expect(parent.getByText(title)).toBeVisible();
  await parentCtx.close();
});
