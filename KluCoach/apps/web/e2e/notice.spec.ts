import { expect, test } from "@playwright/test";
import { expectHeading, loginAs } from "./helpers";

test("teacher can publish a notice and parent can see it", async ({ page, browser }) => {
  const title = `Lab closed ${Date.now()}`;
  await loginAs(page, "teacher@example.test");
  await page.getByRole("link", { name: "Notices" }).click();
  await expectHeading(page, "Notices");
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Message").fill("Physics lab is closed tomorrow.");
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByText(title)).toBeVisible();

  const parentCtx = await browser.newContext();
  const parent = await parentCtx.newPage();
  await loginAs(parent, "parent@example.test");
  await expectHeading(parent, /Aarav/);
  await parent.getByRole("link", { name: "Notices" }).click();
  await expect(parent.getByText(title)).toBeVisible();
  await parentCtx.close();
});
