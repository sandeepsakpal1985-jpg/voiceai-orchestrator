import { expect, test } from "@playwright/test";
import { expectHeading, loginAs } from "./helpers";

test("parent is notified when a child is marked absent and opens the correct Student 360", async ({ page, browser }) => {
  const date = `2026-11-${String((Date.now() % 27) + 1).padStart(2, "0")}`;
  await loginAs(page, "teacher@example.test");
  await expectHeading(page, "Attendance");
  await expect(page.getByLabel("Batch")).toHaveValue(/.+/, { timeout: 15000 });
  await page.getByLabel("Batch").selectOption({ label: "JEE 2027 Morning Batch" });
  await page.getByLabel("Date").fill(date);
  const aarav = page.getByLabel("Aarav attendance");
  await expect(aarav).toBeVisible({ timeout: 15000 });
  await aarav.selectOption("ABSENT");
  await page.getByRole("button", { name: "Save attendance" }).click();
  await expect(page.getByText("Attendance saved")).toBeVisible();

  const parentCtx = await browser.newContext();
  const parent = await parentCtx.newPage();
  await loginAs(parent, "parent@example.test");
  await parent.getByRole("link", { name: /Notifications/ }).click();
  await expectHeading(parent, "Notifications");
  await parent.getByRole("button", { name: "Unread", exact: true }).click();
  const item = parent.getByRole("button", { name: new RegExp(`Aarav was marked absent on ${date}`) });
  await expect(item).toBeVisible({ timeout: 15000 });
  await expect(item).toContainText("Unread");
  await item.click();
  await expectHeading(parent, /Aarav/);
  await expect(parent.getByTestId("student360-status")).toBeVisible();
  await parent.getByRole("link", { name: /Notifications/ }).click();
  await expect(parent.getByRole("button", { name: new RegExp(`Aarav was marked absent on ${date}`) })).not.toContainText(
    "Unread",
  );
  await parentCtx.close();
});

test("parent result notification stays on the correct child", async ({ page, browser }) => {
  const name = `Notify Result ${Date.now()}`;
  await loginAs(page, "teacher@example.test");
  await page.getByRole("link", { name: "Tests" }).click();
  await expectHeading(page, "Tests & results");
  await page.getByLabel("Assessment name").fill(name);
  await expect(page.getByLabel("Batch")).toHaveValue(/.+/, { timeout: 15000 });
  await page.getByLabel("Batch").selectOption({ label: "JEE 2027 Morning Batch" });
  await page.getByLabel("Subject").selectOption({ label: "Physics" });
  await page.getByLabel("Maximum marks").fill("100");
  await page.getByRole("button", { name: "Create assessment" }).click();
  await expect(page.getByText("Assessment created")).toBeVisible();
  const aaravMarks = page.getByLabel("Aarav marks");
  await expect(aaravMarks).toBeVisible({ timeout: 15000 });
  await aaravMarks.fill("87");
  await page.getByRole("button", { name: "Save results" }).click();
  await expect(page.getByText("Results saved")).toBeVisible();

  const parentCtx = await browser.newContext();
  const parent = await parentCtx.newPage();
  await loginAs(parent, "parent@example.test");
  await parent.getByRole("link", { name: /Notifications/ }).click();
  await expect(parent.getByRole("button", { name: /Aarav's Physics result is available/ }).first()).toBeVisible({
    timeout: 15000,
  });
  await parent.getByRole("button", { name: /Aarav's Physics result is available/ }).first().click();
  await expectHeading(parent, /Aarav/);
  await expect(parent.getByRole("button", { name: "Diya Sharma" })).toBeVisible();
  await expect(parent.getByRole("heading", { name: /Diya/ })).toHaveCount(0);
  await parentCtx.close();
});

test("multi-child notifications keep Aarav and Diya contexts separate", async ({ page, browser }) => {
  const date = `2026-12-${String((Date.now() % 27) + 1).padStart(2, "0")}`;
  await loginAs(page, "teacher@example.test");
  await expectHeading(page, "Attendance");
  await expect(page.getByLabel("Batch")).toHaveValue(/.+/, { timeout: 15000 });
  await page.getByLabel("Batch").selectOption({ label: "NEET 2027 Evening Batch" });
  await page.getByLabel("Date").fill(date);
  const diya = page.getByLabel("Diya attendance");
  await expect(diya).toBeVisible({ timeout: 15000 });
  await diya.selectOption("ABSENT");
  await page.getByRole("button", { name: "Save attendance" }).click();
  await expect(page.getByText("Attendance saved")).toBeVisible();

  const parentCtx = await browser.newContext();
  const parent = await parentCtx.newPage();
  await loginAs(parent, "parent@example.test");
  await parent.getByRole("link", { name: /Notifications/ }).click();
  const diyaNote = parent.getByRole("button", { name: new RegExp(`Diya was marked absent on ${date}`) });
  await expect(diyaNote).toBeVisible({ timeout: 15000 });
  await expect(diyaNote).toContainText("Diya");
  await diyaNote.click();
  await expectHeading(parent, /Diya/);
  await expect(parent.getByRole("heading", { name: /Aarav/ })).toHaveCount(0);
  await parentCtx.close();
});

test("student is notified of a new assignment", async ({ page, browser }) => {
  const title = `Notify Asg ${Date.now()}`;
  await loginAs(page, "teacher@example.test");
  await page.getByRole("link", { name: "Assignments" }).click();
  await expectHeading(page, "Assignments");
  await page.locator("#assignment-title").fill(title);
  await expect(page.locator("#assignment-batch")).toHaveValue(/.+/, { timeout: 15000 });
  await page.locator("#assignment-batch").selectOption({ label: "JEE 2027 Morning Batch" });
  await page.getByRole("button", { name: "Create assignment" }).click();
  await expect(page.getByText("Assignment created")).toBeVisible();

  const studentCtx = await browser.newContext();
  const student = await studentCtx.newPage();
  await loginAs(student, "student@example.test");
  await student.getByRole("link", { name: /Notifications/ }).click();
  await expect(student.getByRole("button", { name: new RegExp(`New assignment: ${title}`) }).first()).toBeVisible({
    timeout: 15000,
  });
  await student.getByRole("button", { name: new RegExp(`New assignment: ${title}`) }).first().click();
  await expectHeading(student, "Assignments");
  await studentCtx.close();
});
