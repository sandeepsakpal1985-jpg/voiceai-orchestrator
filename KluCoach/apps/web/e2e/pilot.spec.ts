import { expect, test } from "@playwright/test";
import { apiJson, expectHeading, loginAs, uniqueCalendarDate } from "./helpers";

test("pilot journey: onboard, activate parent, teach, notify, bill, SafeTrack", async ({ page, browser }) => {
  test.setTimeout(180_000);
  const stamp = Date.now();
  const firstName = `Pilot${stamp.toString().slice(-4)}`;
  const admission = `P11-${stamp}`;
  const email = `pilot.parent.${stamp}@example.test`;
  const attDate = uniqueCalendarDate(2026, 10);
  const assessmentName = `Pilot Physics ${stamp}`;
  const assignmentTitle = `Pilot Worksheet ${stamp}`;

  await loginAs(page, "admin@example.test");
  await expectHeading(page, "Institute snapshot");
  await expect(page.getByTestId("onboarding-checklist")).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId("onboarding-progress")).toContainText("/");
  await expect(page.getByTestId("onboarding-students")).toHaveAttribute("data-done", "true");
  await expect(page.getByTestId("onboarding-parentActivation")).toHaveAttribute("data-done", "true");

  await page.getByRole("link", { name: "Students", exact: true }).click();
  await expectHeading(page, "Students");
  await expect(page.getByText("Aarav")).toBeVisible();

  await page.getByLabel("First name").fill(firstName);
  await page.getByLabel("Last name").fill("Shah");
  await page.getByLabel("Admission number").fill(admission);
  await expect(page.locator("#student-branch")).toHaveValue(/.+/, { timeout: 15000 });
  await page.getByLabel("Guardian name").fill("Pilot Guardian");
  await page.getByLabel("Guardian email").fill(email);
  await page.getByRole("button", { name: "Create student" }).click();
  await expectHeading(page, new RegExp(firstName));
  await page.getByLabel("Invitation email").fill(email);
  await page.getByRole("button", { name: "Create invitation" }).click();
  const link = page.getByTestId("invite-accept-url");
  await expect(link).toHaveValue(/accept-invite\?token=/);
  const acceptUrl = await link.inputValue();

  await page.getByRole("link", { name: "Billing" }).click();
  await expectHeading(page, "Billing");
  await expect(page.getByTestId("subscription-status")).toHaveText("ACTIVE");
  await expect(page.getByText(/KluNex/)).toHaveCount(0);

  const inviteCtx = await browser.newContext();
  const invited = await inviteCtx.newPage();
  await invited.goto(acceptUrl);
  await invited.getByLabel("First name").fill("Pilot");
  await invited.getByLabel("Last name").fill("Guardian");
  await invited.getByLabel("Password").fill("InvitePassw0rd!");
  await invited.getByRole("button", { name: "Activate" }).click();
  await expectHeading(invited, new RegExp(firstName));
  await expect(invited.getByTestId("student360-status")).toBeVisible();
  await expect(invited.getByText("O-1001")).toHaveCount(0);
  await inviteCtx.close();

  await loginAs(page, "teacher@example.test");
  await expectHeading(page, "Attendance");
  await expect(page.getByLabel("Batch")).toHaveValue(/.+/, { timeout: 15000 });
  await page.getByLabel("Batch").selectOption({ label: "JEE 2027 Morning Batch" });
  await page.getByLabel("Date").fill(attDate);
  const aarav = page.getByLabel("Aarav attendance");
  await expect(aarav).toBeVisible({ timeout: 15000 });
  await aarav.selectOption("ABSENT");
  await page.getByRole("button", { name: "Save attendance" }).click();
  await expect(page.getByText("Attendance saved")).toBeVisible();

  await page.getByRole("link", { name: "Tests" }).click();
  await expectHeading(page, "Tests & results");
  await page.getByLabel("Assessment name").fill(assessmentName);
  await expect(page.getByLabel("Batch")).toHaveValue(/.+/, { timeout: 15000 });
  await page.getByLabel("Batch").selectOption({ label: "JEE 2027 Morning Batch" });
  await page.getByLabel("Subject").selectOption({ label: "Physics" });
  await page.getByLabel("Maximum marks").fill("100");
  await page.getByLabel("Passing marks").fill("35");
  await page.getByRole("button", { name: "Create assessment" }).click();
  await expect(page.getByText("Assessment created")).toBeVisible();
  const aaravMarks = page.getByLabel("Aarav marks");
  await expect(aaravMarks).toBeVisible({ timeout: 15000 });
  await aaravMarks.fill("87");
  await page.getByRole("button", { name: "Save results" }).click();
  await expect(page.getByText("Results saved")).toBeVisible();

  await page.getByRole("link", { name: "Assignments" }).click();
  await expectHeading(page, "Assignments");
  await page.locator("#assignment-title").fill(assignmentTitle);
  await expect(page.locator("#assignment-batch")).toHaveValue(/.+/, { timeout: 15000 });
  await page.locator("#assignment-batch").selectOption({ label: "JEE 2027 Morning Batch" });
  await page.getByRole("button", { name: "Create assignment" }).click();
  await expect(page.getByText("Assignment created")).toBeVisible();

  const parentCtx = await browser.newContext();
  const parent = await parentCtx.newPage();
  await loginAs(parent, "parent@example.test");
  await expectHeading(parent, /Aarav/);
  await expect(parent.getByText(assessmentName)).toBeVisible();
  await expect(parent.getByText("87%").first()).toBeVisible();
  await parent.getByRole("link", { name: "Attendance" }).click();
  await expectHeading(parent, "Attendance");
  const history = parent.locator(".row", { hasText: attDate }).filter({ hasText: "Aarav" });
  await expect(history).toBeVisible({ timeout: 15000 });
  await expect(history).toContainText("ABSENT");
  await parent.getByRole("link", { name: "Notifications" }).click();
  await expect(parent.getByTestId("notification-preferences")).toBeVisible();
  await expect(parent.getByLabel("Attendance alerts")).toBeVisible();
  await expect(parent.getByText(/absent/i).first()).toBeVisible();

  const studentCtx = await browser.newContext();
  const student = await studentCtx.newPage();
  await loginAs(student, "student@example.test");
  await student.getByRole("link", { name: "Assignments" }).click();
  await expectHeading(student, "Assignments");
  await expect(student.locator("tr", { hasText: assignmentTitle })).toBeVisible({ timeout: 15000 });
  await student.locator("tr", { hasText: assignmentTitle }).getByRole("button", { name: "Submit" }).click();
  await expect(student.getByText("Assignment submitted")).toBeVisible();
  await studentCtx.close();

  await parent.getByRole("link", { name: "Assignments" }).click();
  await expectHeading(parent, "Assignments");
  await expect(parent.getByText(assignmentTitle)).toBeVisible();

  const occurred = new Date(Date.now() + 120_000).toISOString();
  const exitAt = new Date(Date.now() + 180_000).toISOString();
  const entry = await parent.evaluate(async (occurredAt) => {
    const res = await fetch("/api/access/ingest", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-access-device-id": "demo-access-device-a",
        "x-access-device-secret": "DemoDeviceSecret!",
      },
      body: JSON.stringify({ uid: "KC-AARAV-RFID", type: "ENTRY", occurredAt }),
    });
    return { status: res.status, body: await res.json() };
  }, occurred);
  expect(entry.status).toBe(200);
  expect(entry.body.type === "ENTRY" || entry.body.type === "DUPLICATE_SCAN").toBe(true);
  const exit = await parent.evaluate(async (occurredAt) => {
    const res = await fetch("/api/access/ingest", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-access-device-id": "demo-access-device-a",
        "x-access-device-secret": "DemoDeviceSecret!",
      },
      body: JSON.stringify({ uid: "KC-AARAV-RFID", type: "EXIT", occurredAt }),
    });
    return { status: res.status, body: await res.json() };
  }, exitAt);
  expect(exit.status).toBe(200);
  expect(exit.body.type === "EXIT" || exit.body.type === "DUPLICATE_SCAN").toBe(true);

  await parent.goto("/parent");
  await expectHeading(parent, /Aarav/);
  await expect(parent.getByTestId("student-movement")).toBeVisible({ timeout: 15000 });

  const teacherBilling = await apiJson(page, "GET", "/billing/subscription");
  expect(teacherBilling.status).toBe(403);

  await parentCtx.close();
});
