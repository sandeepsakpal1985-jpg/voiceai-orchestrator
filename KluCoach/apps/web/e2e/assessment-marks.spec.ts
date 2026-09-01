import { expect, test } from "@playwright/test";
import { expectHeading, loginAs } from "./helpers";

test("teacher can create an assessment, reject invalid marks, and parent sees the result", async ({ page, browser }) => {
  const name = `E2E Physics ${Date.now()}`;

  await loginAs(page, "teacher@example.test");
  await page.getByRole("link", { name: "Tests" }).click();
  await expectHeading(page, "Tests & results");

  await page.getByLabel("Assessment name").fill(name);
  await expect(page.getByLabel("Batch")).toHaveValue(/.+/, { timeout: 15000 });
  await page.getByLabel("Batch").selectOption({ label: "JEE 2027 Morning Batch" });
  await page.getByLabel("Subject").selectOption({ label: "Physics" });
  await page.getByLabel("Maximum marks").fill("100");
  await page.getByLabel("Passing marks").fill("35");
  await page.getByRole("button", { name: "Create assessment" }).click();
  await expect(page.getByText("Assessment created")).toBeVisible();

  const aaravMarks = page.getByLabel("Aarav marks");
  await expect(aaravMarks).toBeVisible({ timeout: 15000 });
  await aaravMarks.fill("101");
  await page.getByRole("button", { name: "Save results" }).click();
  await expect(page.getByText(/between 0 and 100/i)).toBeVisible();

  await aaravMarks.fill("91");
  await page.getByRole("button", { name: "Save results" }).click();
  await expect(page.getByText("Results saved")).toBeVisible();
  await expect(page.getByText(name).first()).toBeVisible();

  const parentCtx = await browser.newContext();
  const parent = await parentCtx.newPage();
  await loginAs(parent, "parent@example.test");
  await expectHeading(parent, /Aarav/);
  await expect(parent.getByText(name)).toBeVisible();
  await expect(parent.getByText("91%").first()).toBeVisible();
  await parentCtx.close();
});
