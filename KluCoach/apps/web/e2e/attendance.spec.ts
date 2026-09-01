import { expect, test } from "@playwright/test";
import { expectHeading, loginAs } from "./helpers";

const DATE = "2026-09-03";

test("teacher can save attendance and parent sees the result", async ({ page, browser }) => {
  await loginAs(page, "teacher@example.test");
  await expectHeading(page, "Attendance");
  await expect(page.getByLabel("Batch")).toHaveValue(/.+/, { timeout: 15000 });
  await page.getByLabel("Batch").selectOption({ label: "JEE 2027 Morning Batch" });
  await page.getByLabel("Date").fill(DATE);
  const aarav = page.getByLabel("Aarav attendance");
  await expect(aarav).toBeVisible({ timeout: 15000 });
  await aarav.selectOption("ABSENT");
  const meera = page.getByLabel("Meera attendance");
  await expect(meera).toBeVisible();
  await meera.selectOption("LATE");
  const vivaan = page.getByLabel("Vivaan attendance");
  await expect(vivaan).toBeVisible();
  await vivaan.selectOption("EXCUSED");
  await page.getByRole("button", { name: "Save attendance" }).click();
  await expect(page.getByText("Attendance saved")).toBeVisible();

  await page.reload();
  await expectHeading(page, "Attendance");
  await page.getByLabel("Batch").selectOption({ label: "JEE 2027 Morning Batch" });
  await page.getByLabel("Date").fill(DATE);
  await expect(page.getByLabel("Aarav attendance")).toHaveValue("ABSENT", { timeout: 15000 });
  await expect(page.getByLabel("Meera attendance")).toHaveValue("LATE");
  await expect(page.getByLabel("Vivaan attendance")).toHaveValue("EXCUSED");

  const parentCtx = await browser.newContext();
  const parent = await parentCtx.newPage();
  await loginAs(parent, "parent@example.test");
  await expectHeading(parent, /Aarav/);
  await expect(parent.getByText("ABSENT").first()).toBeVisible();
  await expect(parent.getByText(DATE).first()).toBeVisible();
  await parent.getByRole("link", { name: "Attendance" }).click();
  await expectHeading(parent, "Attendance");
  await expect(parent.getByText("ABSENT").first()).toBeVisible();
  await parentCtx.close();
});
