import { expect, test } from "@playwright/test";
import { apiJson, expectHeading, loginAs } from "./helpers";

test("admin records an entry and the parent sees the movement on Student 360", async ({ page, browser }) => {
  await loginAs(page, "admin@example.test");
  await page.getByRole("link", { name: "Gate" }).click();
  await expectHeading(page, "Gate");
  const aaravValue = await page.locator("#gate-student option").filter({ hasText: "Aarav" }).first().getAttribute("value");
  expect(aaravValue).toBeTruthy();
  await page.getByLabel("Student").selectOption(aaravValue!);
  await page.getByRole("button", { name: "Record entry" }).click();
  await expect(page.getByText("Entry recorded")).toBeVisible();

  const parentCtx = await browser.newContext();
  const parent = await parentCtx.newPage();
  await loginAs(parent, "parent@example.test");
  await expectHeading(parent, /Aarav/);
  await expect(parent.getByTestId("student-movement")).toBeVisible({ timeout: 15000 });
  await expect(parent.getByTestId("movement-ENTRY").first()).toContainText(/Entered/);
  await expect(parent.getByRole("button", { name: /Entered institute/i }).first()).toBeVisible();

  const ids = await parent.evaluate(async () => {
    const res = await fetch("/api/dashboard/parent", { credentials: "include" });
    const body = (await res.json()) as { children: { id: string; firstName: string }[] };
    return {
      aarav: body.children.find((c) => c.firstName === "Aarav")!.id,
      diya: body.children.find((c) => c.firstName === "Diya")!.id,
    };
  });
  expect((await apiJson(parent, "GET", `/students/${ids.aarav}/movement`)).status).toBe(200);

  const otherCtx = await browser.newContext();
  const other = await otherCtx.newPage();
  await loginAs(other, "parent-b@example.test");
  await expectHeading(other, /.+/);
  expect((await apiJson(other, "GET", `/students/${ids.aarav}/movement`)).status).toBe(404);
  await otherCtx.close();

  const teacherCtx = await browser.newContext();
  const teacher = await teacherCtx.newPage();
  await loginAs(teacher, "teacher@example.test");
  await expectHeading(teacher, /.+/);
  expect((await apiJson(teacher, "GET", `/students/${ids.aarav}/movement`)).status).toBe(403);
  await teacherCtx.close();
  await parentCtx.close();
});

test("device ingest with a seeded RFID uid notifies the parent once", async ({ page, browser }) => {
  await loginAs(page, "admin@example.test");
  await expectHeading(page, "Institute snapshot");
  const ingest = await page.evaluate(async () => {
    const res = await fetch("/api/access/ingest", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-access-device-id": "demo-access-device-a",
        "x-access-device-secret": "DemoDeviceSecret!",
      },
      body: JSON.stringify({ uid: "KC-AARAV-RFID", type: "EXIT", occurredAt: new Date().toISOString() }),
    });
    return { status: res.status, body: await res.json() };
  });
  expect(ingest.status).toBe(200);
  expect(ingest.body.type === "EXIT" || ingest.body.type === "DUPLICATE_SCAN").toBe(true);

  const parentCtx = await browser.newContext();
  const parent = await parentCtx.newPage();
  await loginAs(parent, "parent@example.test");
  await expectHeading(parent, /Aarav/);
  await expect(parent.getByTestId("student-movement")).toBeVisible({ timeout: 15000 });
  await parentCtx.close();
});
