import { expect, test } from "@playwright/test";
import { expectHeading, loginAs } from "./helpers";

test("teacher can create a timetable slot in the admin table", async ({ page }) => {
  const room = `E2E-${Date.now()}`;
  await loginAs(page, "teacher@example.test");
  await page.getByRole("link", { name: "Timetable" }).click();
  await expectHeading(page, "Timetable");
  await expect(page.locator("#slot-batch")).toHaveValue(/.+/, { timeout: 15000 });
  await page.locator("#slot-batch").selectOption({ label: "JEE 2027 Morning Batch" });
  await page.locator("#slot-room").fill(room);
  await page.getByRole("button", { name: "Create slot" }).click();
  await expect(page.getByText("Slot created")).toBeVisible();
  await expect(page.getByText(room)).toBeVisible();
});
