import { expect, test } from "@playwright/test";
import { expectHeading, loginAs } from "./helpers";

const STATUS = /Doing Well|On Track|Needs Attention|Not enough data/;

test("parent home loads Student 360 for the selected child", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAs(page, "parent@example.test");
  await expectHeading(page, /Aarav/);
  await expect(page.getByRole("group", { name: "Select child" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Aarav Sharma" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".kpis .label").filter({ hasText: /^Attendance$/ })).toBeVisible();
  await expect(page.getByTestId("student360-status")).toHaveText(STATUS);
  await expect(page.getByRole("heading", { name: "Attendance" })).toBeVisible();
  await expect(page.getByText("Physics Unit Test 1")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Upcoming classes" })).toBeVisible();
  await expect(page.getByText(/Physics/).first()).toBeVisible();
  await expect(page.getByText("Motion numericals worksheet")).toBeVisible();
  await expect(page.getByText("Independence Day holiday")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Fees" })).toBeVisible();
});

test("parent can switch children and cannot open an unrelated student", async ({ page, browser }) => {
  await loginAs(page, "parent@example.test");
  await expectHeading(page, /Aarav/);
  await expect(page.getByText("Physics Unit Test 1")).toBeVisible();
  await page.getByRole("button", { name: "Diya Sharma" }).click();
  await expectHeading(page, /Diya/);
  await expect(page.getByTestId("student360-status")).toHaveText("Not enough data");
  await expect(page.getByText("Physics Unit Test 1")).toHaveCount(0);
  await expect(page.getByText("Attendance data unavailable")).toBeVisible();
  await expect(page.getByText("No assessments yet").first()).toBeVisible();
  await expect(page.getByText(/Biology/)).toBeVisible();
  await expect(page.getByText("Doing Well")).toHaveCount(0);

  await page.goto("/parent?studentId=not-a-real-child");
  await expect(page.getByText(/not found/i)).toBeVisible({ timeout: 15000 });

  const otherCtx = await browser.newContext();
  const other = await otherCtx.newPage();
  await loginAs(other, "parent-b@example.test");
  await expectHeading(other, /.+/);
  const foreignId = await other.evaluate(async () => {
    const res = await fetch("/api/dashboard/parent", { credentials: "include" });
    const body = (await res.json()) as { snapshot?: { student?: { id: string } } };
    return body.snapshot?.student?.id ?? null;
  });
  await otherCtx.close();
  expect(foreignId).toBeTruthy();

  const denied = await page.evaluate(async (id) => {
    const res = await fetch(`/api/students/${id}/360`, { credentials: "include" });
    return res.status;
  }, foreignId);
  expect(denied).toBe(404);
});

test("student sees own Student 360 and cannot open another student", async ({ page, browser }) => {
  const parentCtx = await browser.newContext();
  const parent = await parentCtx.newPage();
  await loginAs(parent, "parent@example.test");
  await expectHeading(parent, /Aarav/);
  await parent.getByRole("button", { name: "Diya Sharma" }).click();
  await expectHeading(parent, /Diya/);
  const diyaId = await parent.evaluate(async () => {
    const res = await fetch("/api/dashboard/parent", { credentials: "include" });
    const body = (await res.json()) as { children: { id: string; firstName: string }[] };
    return body.children.find((c) => c.firstName === "Diya")!.id;
  });
  await parentCtx.close();

  await loginAs(page, "student@example.test");
  await expectHeading(page, /Aarav/);
  await expect(page.getByRole("group", { name: "Select child" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Attendance" })).toBeVisible();
  await expect(page.getByText("Physics Unit Test 1")).toBeVisible();
  await expect(page.getByText("Motion numericals worksheet")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Upcoming classes" })).toBeVisible();
  await page.getByRole("link", { name: "Timetable" }).click();
  await expectHeading(page, "Timetable");
  await page.getByRole("link", { name: "Assignments" }).click();
  await expectHeading(page, "Assignments");
  await page.getByRole("link", { name: "Home" }).click();
  await expectHeading(page, /Aarav/);

  const denied = await page.evaluate(async (id) => {
    const res = await fetch(`/api/students/${id}/360`, { credentials: "include" });
    return res.status;
  }, diyaId);
  expect(denied).toBe(404);
});
