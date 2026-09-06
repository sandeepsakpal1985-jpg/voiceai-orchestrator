import { expect, test, type Page } from "@playwright/test";
import { apiJson, expectHeading, loginAs } from "./helpers";

const AS_OF = "2026-09-05T12:00:00.000Z";

async function jeeAndAarav(page: Page) {
  const batches = await apiJson<{ id: string; name: string }[] | { items: { id: string; name: string }[] }>(
    page,
    "GET",
    "/batches",
  );
  expect(batches.status).toBe(200);
  const batchList = Array.isArray(batches.json) ? batches.json : batches.json?.items ?? [];
  const jee = batchList.find((b) => b.name.includes("JEE"));
  expect(jee).toBeTruthy();
  const students = await apiJson<{ id: string; firstName: string }[]>(
    page,
    "GET",
    `/students?batchId=${jee!.id}`,
  );
  expect(students.status).toBe(200);
  const list = Array.isArray(students.json) ? students.json : [];
  const aarav = list.find((s) => s.firstName === "Aarav");
  expect(aarav).toBeTruthy();
  return { batchId: jee!.id, studentId: aarav!.id };
}

async function subjectId(page: Page, name: string) {
  const subjects = await apiJson<{ id: string; name: string }[]>(page, "GET", "/subjects");
  expect(subjects.status).toBe(200);
  const row = (subjects.json ?? []).find((s) => s.name === name);
  expect(row).toBeTruthy();
  return row!.id;
}

async function runInsights(page: Page) {
  await expectHeading(page, /Institute snapshot|Attendance|Tests|Assignments/);
  const run = await apiJson<{ created: number; detected: number }>(page, "POST", "/insights/run", { asOf: AS_OF });
  expect(run.status, JSON.stringify(run.json)).toBe(200);
  return run.json;
}

async function findNotificationByType(page: Page, type: string) {
  for (let p = 1; p <= 10; p++) {
    const notices = await apiJson<{ items: { id: string; type: string; href: string }[]; total: number }>(
      page,
      "GET",
      `/notifications?page=${p}&pageSize=50`,
    );
    expect(notices.status).toBe(200);
    const found = (notices.json?.items ?? []).find((n) => n.type === type);
    if (found) return found;
    if ((notices.json?.items ?? []).length < 50) break;
  }
  return undefined;
}

test("parent sees an attendance insight and opens authorized Student 360", async ({ page, browser }) => {
  await loginAs(page, "teacher@example.test");
  await expectHeading(page, "Attendance");
  const ids = await jeeAndAarav(page);
  for (let i = 0; i < 6; i++) {
    const day = `2026-07-${String(8 + i).padStart(2, "0")}`;
    const status = await apiJson(page, "POST", "/attendance", {
      batchId: ids.batchId,
      date: day,
      records: [{ studentId: ids.studentId, status: "PRESENT" }],
    });
    expect(status.status, JSON.stringify(status.json)).toBe(201);
  }
  for (let i = 0; i < 6; i++) {
    const day = `2026-08-${String(10 + i).padStart(2, "0")}`;
    const marked = i === 0 ? "PRESENT" : "ABSENT";
    const status = await apiJson(page, "POST", "/attendance", {
      batchId: ids.batchId,
      date: day,
      records: [{ studentId: ids.studentId, status: marked }],
    });
    expect(status.status, JSON.stringify(status.json)).toBe(201);
  }

  const adminCtx = await browser.newContext();
  const admin = await adminCtx.newPage();
  await loginAs(admin, "admin@example.test");
  await expectHeading(admin, "Institute snapshot");
  const first = await runInsights(admin);
  const second = await runInsights(admin);
  expect(second?.created).toBe(0);
  expect((first?.detected ?? 0) + (second?.detected ?? 0)).toBeGreaterThan(0);
  await adminCtx.close();

  const parentCtx = await browser.newContext();
  const parent = await parentCtx.newPage();
  await loginAs(parent, "parent@example.test");
  await expectHeading(parent, /Aarav/);
  await expect(parent.getByTestId("student-insights")).toBeVisible({ timeout: 15000 });
  const decline = parent.getByTestId("insight-ATTENDANCE_DECLINE").first();
  await expect(decline).toContainText(/Attendance decreased from /);
  await decline.click();
  await expectHeading(parent, /Aarav/);
  await expect(parent.getByTestId("student-360")).toBeVisible();

  const insights = await apiJson<{ items: { type: string }[] }>(parent, "GET", `/students/${ids.studentId}/insights`);
  expect(insights.status).toBe(200);
  expect((insights.json?.items ?? []).filter((i) => i.type === "ATTENDANCE_DECLINE").length).toBeGreaterThanOrEqual(1);

  const insightNotice = await findNotificationByType(parent, "ATTENDANCE_DECLINE");
  expect(insightNotice).toBeTruthy();
  const ownNotice = await apiJson<{ href: string }>(parent, "GET", `/notifications/${insightNotice!.id}`);
  expect(ownNotice.status).toBe(200);
  const own360 = await apiJson(parent, "GET", `/students/${ids.studentId}/360`);
  expect(own360.status).toBe(200);

  await parent.goto(ownNotice.json?.href || insightNotice!.href);
  await expectHeading(parent, /Aarav/);
  await expect(parent.getByTestId("student-360")).toBeVisible();

  const otherCtx = await browser.newContext();
  const other = await otherCtx.newPage();
  await loginAs(other, "parent-b@example.test");
  await expectHeading(other, /.+/);
  const foreign = await other.evaluate(async () => {
    const res = await fetch("/api/dashboard/parent", { credentials: "include" });
    const body = (await res.json()) as { snapshot?: { student?: { id: string } } };
    return body.snapshot?.student?.id ?? null;
  });
  expect(foreign).toBeTruthy();
  const denied = await apiJson(parent, "GET", `/students/${foreign}/insights`);
  expect(denied.status).toBe(404);
  const denied360 = await apiJson(parent, "GET", `/students/${foreign}/360`);
  expect(denied360.status).toBe(404);
  const deniedNotice = await apiJson(other, "GET", `/notifications/${insightNotice!.id}`);
  expect(deniedNotice.status).toBe(404);
  const otherAarav360 = await apiJson(other, "GET", `/students/${ids.studentId}/360`);
  expect(otherAarav360.status).toBe(404);
  await otherCtx.close();
  await parentCtx.close();
});

test("parent sees an academic insight after results are published", async ({ page, browser }) => {
  await loginAs(page, "teacher@example.test");
  await page.getByRole("link", { name: "Tests" }).click();
  await expectHeading(page, "Tests & results");
  const ids = await jeeAndAarav(page);
  const physics = await subjectId(page, "Physics");
  const stamp = Date.now();
  const dates = [
    ["2026-07-11", 70],
    ["2026-07-12", 71],
    ["2026-07-13", 72],
    ["2026-07-14", 73],
    ["2026-08-11", 84],
    ["2026-08-12", 85],
    ["2026-08-13", 86],
    ["2026-08-14", 87],
  ] as const;
  for (const [date, marks] of dates) {
    const created = await apiJson<{ id: string }>(page, "POST", "/assessments", {
      name: `Insight ${stamp} ${date}`,
      batchId: ids.batchId,
      subjectId: physics,
      date,
      maxMarks: 100,
      passingMarks: 35,
    });
    expect(created.status, JSON.stringify(created.json)).toBe(201);
    const results = await apiJson(page, "POST", `/assessments/${created.json!.id}/results`, {
      results: [{ studentId: ids.studentId, marks }],
    });
    expect(results.status, JSON.stringify(results.json)).toBe(200);
  }

  const adminCtx = await browser.newContext();
  const admin = await adminCtx.newPage();
  await loginAs(admin, "admin@example.test");
  await expectHeading(admin, "Institute snapshot");
  await runInsights(admin);
  await adminCtx.close();

  const parentCtx = await browser.newContext();
  const parent = await parentCtx.newPage();
  await loginAs(parent, "parent@example.test");
  await expectHeading(parent, /Aarav/);
  await expect(parent.getByTestId("insight-ACADEMIC_IMPROVEMENT").first()).toContainText(
    /Recent assessment average improved from /,
  );
  await parentCtx.close();
});

test("parent sees an overdue assignment insight after the job runs", async ({ page, browser }) => {
  await loginAs(page, "teacher@example.test");
  await page.getByRole("link", { name: "Assignments" }).click();
  await expectHeading(page, "Assignments");
  const ids = await jeeAndAarav(page);
  const physics = await subjectId(page, "Physics");
  const title = `Overdue insight ${Date.now()}`;
  const created = await apiJson<{ id: string }>(page, "POST", "/assignments", {
    title,
    batchId: ids.batchId,
    subjectId: physics,
    dueAt: "2026-09-01T00:00:00.000Z",
  });
  expect(created.status, JSON.stringify(created.json)).toBe(201);

  const adminCtx = await browser.newContext();
  const admin = await adminCtx.newPage();
  await loginAs(admin, "admin@example.test");
  await expectHeading(admin, "Institute snapshot");
  await runInsights(admin);
  await adminCtx.close();

  const parentCtx = await browser.newContext();
  const parent = await parentCtx.newPage();
  await loginAs(parent, "parent@example.test");
  await expectHeading(parent, /Aarav/);
  await expect(parent.getByTestId("student-insights").getByRole("button", { name: new RegExp(title) })).toBeVisible();
  await parentCtx.close();
});

test("student sees own insight and cannot read a sibling insight", async ({ page, browser }) => {
  const parentCtx = await browser.newContext();
  const parent = await parentCtx.newPage();
  await loginAs(parent, "parent@example.test");
  await expectHeading(parent, /Aarav/);
  const ids = await parent.evaluate(async () => {
    const res = await fetch("/api/dashboard/parent", { credentials: "include" });
    const body = (await res.json()) as { children: { id: string; firstName: string }[] };
    return {
      aarav: body.children.find((c) => c.firstName === "Aarav")!.id,
      diya: body.children.find((c) => c.firstName === "Diya")!.id,
    };
  });
  await parentCtx.close();

  await loginAs(page, "student@example.test");
  await expectHeading(page, /Aarav/);
  const own = await apiJson(page, "GET", `/students/${ids.aarav}/insights`);
  expect(own.status).toBe(200);
  const sibling = await apiJson(page, "GET", `/students/${ids.diya}/insights`);
  expect(sibling.status).toBe(404);
  await expect(page.getByTestId("student-insights")).toBeVisible({ timeout: 15000 });
});
