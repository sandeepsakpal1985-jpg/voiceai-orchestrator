import { expect, test } from "@playwright/test";
import { expectHeading, loginAs } from "./helpers";

test("teacher can create an assignment and student can submit it", async ({ page, browser }) => {
  const title = `E2E Worksheet ${Date.now()}`;
  await loginAs(page, "teacher@example.test");
  await page.getByRole("link", { name: "Assignments" }).click();
  await expectHeading(page, "Assignments");
  await page.locator("#assignment-title").fill(title);
  await expect(page.locator("#assignment-batch")).toHaveValue(/.+/, { timeout: 15000 });
  await page.locator("#assignment-batch").selectOption({ label: "JEE 2027 Morning Batch" });
  await page.getByRole("button", { name: "Create assignment" }).click();
  await expect(page.getByText("Assignment created")).toBeVisible();
  await expect(page.getByText(title)).toBeVisible();

  const studentCtx = await browser.newContext();
  const student = await studentCtx.newPage();
  await loginAs(student, "student@example.test");
  await student.getByRole("link", { name: "Assignments" }).click();
  await expectHeading(student, "Assignments");
  await expect(student.getByText(title)).toBeVisible();
  await student.locator("tr", { hasText: title }).getByRole("button", { name: "Submit" }).click();
  await expect(student.getByText("Assignment submitted")).toBeVisible();
  await expect(student.locator("tr", { hasText: title }).locator("span.hint")).toHaveText("Submitted");
  await studentCtx.close();
});
