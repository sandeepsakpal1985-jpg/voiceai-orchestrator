import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@klunex-edu/database";
import { CSRF_HEADER } from "@klunex-edu/shared";
import { buildApp } from "../../app.js";
import { runStudentInsights } from "./service.js";

const password = "DemoPassw0rd!";
type App = Awaited<ReturnType<typeof buildApp>>;
type Auth = { headers: { cookie: string; [key: string]: string } };

let app: App;

async function login(email: string): Promise<Auth> {
  const res = await app.inject({ method: "POST", url: "/auth/login", payload: { email, password } });
  expect(res.statusCode, res.body).toBe(200);
  const body = res.json() as { csrfToken: string };
  const cookies = res.cookies.map((c: { name: string; value: string }) => `${c.name}=${c.value}`).join("; ");
  return { headers: { cookie: cookies, [CSRF_HEADER]: body.csrfToken } };
}

function json<T>(res: { json: () => unknown }) {
  return res.json() as T;
}

const asOf = new Date("2026-09-05T12:00:00.000Z");

async function seedAttendance(institutionId: string, studentId: string, batchId: string, markedById: string) {
  const teacher = await prisma.user.findFirst({ where: { email: "teacher@example.test" } });
  const marker = markedById || teacher!.id;
  const rows: { date: Date; status: "PRESENT" | "ABSENT" }[] = [];
  for (let i = 0; i < 6; i++) rows.push({ date: new Date(`2026-07-${String(8 + i).padStart(2, "0")}T00:00:00.000Z`), status: "PRESENT" });
  for (let i = 0; i < 6; i++) rows.push({ date: new Date(`2026-08-${String(10 + i).padStart(2, "0")}T00:00:00.000Z`), status: i === 0 ? "PRESENT" : "ABSENT" });
  for (const row of rows) {
    await prisma.attendanceRecord.create({
      data: { institutionId, studentId, batchId, date: row.date, status: row.status, markedById: marker },
    });
  }
}

beforeAll(async () => {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for integration tests");
  app = await buildApp();
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe("proactive insight authorization", () => {
  it("creates one attendance decline insight and notification even if the job runs repeatedly", { timeout: 120_000 }, async () => {
    const parent = await login("parent@example.test");
    const admin = await login("admin@example.test");
    const home = json<{ children: { id: string; firstName: string }[] }>(
      await app.inject({ method: "GET", url: "/dashboard/parent", headers: parent.headers }),
    );
    const aarav = home.children.find((c) => c.firstName === "Aarav")!;
    const student = await prisma.student.findFirst({ where: { id: aarav.id }, include: { enrollments: true } });
    const teacher = await prisma.user.findFirst({ where: { email: "teacher@example.test" } });
    await prisma.studentInsight.deleteMany({ where: { studentId: aarav.id, type: "ATTENDANCE_DECLINE" } });
    await prisma.notification.deleteMany({ where: { studentId: aarav.id, type: "ATTENDANCE_DECLINE" } });
    await prisma.attendanceRecord.deleteMany({
      where: {
        studentId: aarav.id,
        date: { gte: new Date("2026-07-07T00:00:00.000Z"), lt: new Date("2026-09-05T00:00:00.000Z") },
        classSessionId: null,
      },
    });
    await seedAttendance(student!.institutionId, aarav.id, student!.enrollments[0]!.batchId, teacher!.id);

    const first = await runStudentInsights({ institutionId: student!.institutionId, studentIds: [aarav.id], asOf });
    expect(first.created).toBeGreaterThanOrEqual(1);
    for (let i = 0; i < 9; i++) {
      await runStudentInsights({ institutionId: student!.institutionId, studentIds: [aarav.id], asOf });
    }
    const insights = await prisma.studentInsight.count({
      where: { studentId: aarav.id, type: "ATTENDANCE_DECLINE", dedupeKey: "ATTENDANCE_DECLINE:2026-08-06" },
    });
    expect(insights).toBe(1);
    const parentUser = await prisma.user.findFirst({ where: { email: "parent@example.test" } });
    const studentUser = await prisma.user.findFirst({ where: { email: "student@example.test" } });
    await prisma.notification.deleteMany({
      where: { studentId: aarav.id, type: "ATTENDANCE_DECLINE" },
    });
    await runStudentInsights({ institutionId: student!.institutionId, studentIds: [aarav.id], asOf });
    expect(
      await prisma.notification.count({
        where: { studentId: aarav.id, type: "ATTENDANCE_DECLINE", userId: parentUser!.id },
      }),
    ).toBe(1);

    const parentNotice = await prisma.notification.findFirst({
      where: { studentId: aarav.id, type: "ATTENDANCE_DECLINE", userId: parentUser!.id },
    });
    expect(parentNotice).toBeTruthy();
    const ownNotice = await app.inject({
      method: "GET",
      url: `/notifications/${parentNotice!.id}`,
      headers: parent.headers,
    });
    expect(ownNotice.statusCode).toBe(200);
    const own360 = await app.inject({ method: "GET", url: `/students/${aarav.id}/360`, headers: parent.headers });
    expect(own360.statusCode).toBe(200);

    const studentAuth = await login("student@example.test");
    const studentOwnNotice = await prisma.notification.findFirst({
      where: { studentId: aarav.id, type: "ATTENDANCE_DECLINE", userId: studentUser!.id },
    });
    expect(studentOwnNotice).toBeTruthy();
    const studentNoticeOk = await app.inject({
      method: "GET",
      url: `/notifications/${studentOwnNotice!.id}`,
      headers: studentAuth.headers,
    });
    expect(studentNoticeOk.statusCode).toBe(200);
    const studentReadsParent = await app.inject({
      method: "GET",
      url: `/notifications/${parentNotice!.id}`,
      headers: studentAuth.headers,
    });
    expect(studentReadsParent.statusCode).toBe(404);
    const parentReadsStudent = await app.inject({
      method: "GET",
      url: `/notifications/${studentOwnNotice!.id}`,
      headers: parent.headers,
    });
    expect(parentReadsStudent.statusCode).toBe(404);

    const parentB = await login("parent-b@example.test");
    const crossNotice = await app.inject({
      method: "GET",
      url: `/notifications/${parentNotice!.id}`,
      headers: parentB.headers,
    });
    expect(crossNotice.statusCode).toBe(404);
    const parentB360 = await app.inject({
      method: "GET",
      url: `/students/${aarav.id}/360`,
      headers: parentB.headers,
    });
    expect(parentB360.statusCode).toBe(404);
    const adminB = await login("admin-b@example.test");
    const bStudents = json<{ id: string }[]>(await app.inject({ method: "GET", url: "/students", headers: adminB.headers }));
    const cross360 = await app.inject({
      method: "GET",
      url: `/students/${bStudents[0]!.id}/360`,
      headers: parent.headers,
    });
    expect(cross360.statusCode).toBe(404);
    const adminBNotice = await app.inject({
      method: "GET",
      url: `/notifications/${parentNotice!.id}`,
      headers: adminB.headers,
    });
    expect(adminBNotice.statusCode).toBe(404);
    const tamperedNotice = await app.inject({
      method: "GET",
      url: `/notifications/${aarav.id}`,
      headers: parent.headers,
    });
    expect(tamperedNotice.statusCode).toBe(404);

    const list = await app.inject({ method: "GET", url: `/students/${aarav.id}/insights`, headers: parent.headers });
    expect(list.statusCode, list.body).toBe(200);
    const items = json<{ items: { type: string; summary: string; source: { previousPercentage?: number } }[] }>(list).items;
    const decline = items.find((i) => i.type === "ATTENDANCE_DECLINE");
    expect(decline?.summary).toMatch(/decreased from /);
    expect(decline?.source.previousPercentage).toBe(100);

    const run = await app.inject({
      method: "POST",
      url: "/insights/run",
      headers: admin.headers,
      payload: { asOf: asOf.toISOString() },
    });
    expect(run.statusCode, run.body).toBe(200);
  });

  it("lets a student see own insights and 404s a sibling", async () => {
    const student = await login("student@example.test");
    const parent = await login("parent@example.test");
    const home = json<{ children: { id: string; firstName: string }[] }>(
      await app.inject({ method: "GET", url: "/dashboard/parent", headers: parent.headers }),
    );
    const aarav = home.children.find((c) => c.firstName === "Aarav")!;
    const diya = home.children.find((c) => c.firstName === "Diya")!;
    const own = await app.inject({ method: "GET", url: `/students/${aarav.id}/insights`, headers: student.headers });
    expect(own.statusCode).toBe(200);
    const sibling = await app.inject({ method: "GET", url: `/students/${diya.id}/insights`, headers: student.headers });
    expect(sibling.statusCode).toBe(404);
    const parentDiya = await app.inject({ method: "GET", url: `/students/${diya.id}/insights`, headers: parent.headers });
    expect(parentDiya.statusCode).toBe(200);
    const anon = await app.inject({ method: "GET", url: `/students/${aarav.id}/insights` });
    expect(anon.statusCode).toBe(401);
  });

  it("404s tenant B and forbids super-admin student insight reads", async () => {
    const parent = await login("parent@example.test");
    const adminB = await login("admin-b@example.test");
    const superadmin = await login("superadmin@example.test");
    const home = json<{ children: { id: string }[] }>(
      await app.inject({ method: "GET", url: "/dashboard/parent", headers: parent.headers }),
    );
    const bStudents = json<{ id: string }[]>(await app.inject({ method: "GET", url: "/students", headers: adminB.headers }));
    const cross = await app.inject({
      method: "GET",
      url: `/students/${bStudents[0]!.id}/insights`,
      headers: parent.headers,
    });
    expect(cross.statusCode).toBe(404);
    const platform = await app.inject({
      method: "GET",
      url: `/students/${home.children[0]!.id}/insights`,
      headers: superadmin.headers,
    });
    expect([401, 403]).toContain(platform.statusCode);
    const summary = await app.inject({ method: "GET", url: "/insights/summary", headers: adminB.headers });
    expect(summary.statusCode).toBe(200);
    const parentSummary = await app.inject({ method: "GET", url: "/insights/summary", headers: parent.headers });
    expect(parentSummary.statusCode).toBe(403);
    const adminA = await login("admin@example.test");
    const adminCross = await app.inject({
      method: "GET",
      url: `/students/${bStudents[0]!.id}/insights`,
      headers: adminA.headers,
    });
    expect(adminCross.statusCode).toBe(404);
    const teacherRun = await app.inject({
      method: "POST",
      url: "/insights/run",
      headers: (await login("teacher@example.test")).headers,
      payload: { asOf: asOf.toISOString() },
    });
    expect(teacherRun.statusCode).toBe(403);
  });

  it("lets a teacher read an assigned student and 404s an unassigned batch student", async () => {
    const teacher = await login("teacher@example.test");
    const admin = await login("admin@example.test");
    const parent = await login("parent@example.test");
    const home = json<{ children: { id: string; firstName: string }[] }>(
      await app.inject({ method: "GET", url: "/dashboard/parent", headers: parent.headers }),
    );
    const aarav = home.children.find((c) => c.firstName === "Aarav")!;
    const ok = await app.inject({ method: "GET", url: `/students/${aarav.id}/insights`, headers: teacher.headers });
    expect(ok.statusCode).toBe(200);

    const branches = json<{ id: string }[]>(await app.inject({ method: "GET", url: "/branches", headers: admin.headers }));
    const years = json<{ id: string }[]>(
      await app.inject({ method: "GET", url: "/academic-years", headers: admin.headers }),
    );
    const programs = json<{ id: string }[]>(await app.inject({ method: "GET", url: "/programs", headers: admin.headers }));
    const batch = await app.inject({
      method: "POST",
      url: "/batches",
      headers: admin.headers,
      payload: {
        name: `Insight Unassigned ${Date.now()}`,
        branchId: branches[0]!.id,
        academicYearId: years[0]!.id,
        programId: programs[0]!.id,
      },
    });
    expect(batch.statusCode).toBe(201);
    const created = await app.inject({
      method: "POST",
      url: "/students",
      headers: admin.headers,
      payload: {
        firstName: "Insight",
        lastName: "Only",
        admissionNumber: `ins-${Date.now()}`,
        branchId: branches[0]!.id,
        batchId: json<{ id: string }>(batch).id,
      },
    });
    expect(created.statusCode, created.body).toBe(201);
    const denied = await app.inject({
      method: "GET",
      url: `/students/${json<{ id: string }>(created).id}/insights`,
      headers: teacher.headers,
    });
    expect(denied.statusCode).toBe(404);
  });

  it("creates an overdue assignment insight once", { timeout: 180_000 }, async () => {
    const admin = await login("admin@example.test");
    const teacher = await login("teacher@example.test");
    const parent = await login("parent@example.test");
    const home = json<{ children: { id: string; firstName: string }[] }>(
      await app.inject({ method: "GET", url: "/dashboard/parent", headers: parent.headers }),
    );
    const aarav = home.children.find((c) => c.firstName === "Aarav")!;
    const batches = json<{ id: string; name: string }[]>(await app.inject({ method: "GET", url: "/batches", headers: teacher.headers }));
    const jee = batches.find((b) => b.name.includes("JEE"))!;
    const subjects = json<{ id: string; name: string }[]>(
      await app.inject({ method: "GET", url: "/subjects", headers: teacher.headers }),
    );
    const physics = subjects.find((s) => s.name === "Physics")!;
    const created = await app.inject({
      method: "POST",
      url: "/assignments",
      headers: teacher.headers,
      payload: {
        title: `Overdue insight ${Date.now()}`,
        batchId: jee.id,
        subjectId: physics.id,
        dueAt: "2026-09-01T00:00:00.000Z",
      },
    });
    expect(created.statusCode, created.body).toBe(201);
    const assignmentId = json<{ id: string }>(created).id;
    const first = await runStudentInsights({
      institutionId: (await prisma.student.findFirst({ where: { id: aarav.id } }))!.institutionId,
      studentIds: [aarav.id],
      asOf,
    });
    expect(first.detected).toBeGreaterThan(0);
    const second = await runStudentInsights({
      institutionId: (await prisma.student.findFirst({ where: { id: aarav.id } }))!.institutionId,
      studentIds: [aarav.id],
      asOf,
    });
    expect(second.created).toBe(0);
    const rows = await prisma.studentInsight.count({
      where: { studentId: aarav.id, type: "ASSIGNMENT_OVERDUE", dedupeKey: `ASSIGNMENT_OVERDUE:${assignmentId}` },
    });
    expect(rows).toBe(1);
    const list = json<{ items: { type: string; title: string }[] }>(
      await app.inject({ method: "GET", url: `/students/${aarav.id}/insights`, headers: admin.headers }),
    );
    expect(list.items.some((i) => i.type === "ASSIGNMENT_OVERDUE")).toBe(true);
  });

  it("creates academic improvement from published results", { timeout: 180_000 }, async () => {
    const teacher = await login("teacher@example.test");
    const parent = await login("parent@example.test");
    const home = json<{ children: { id: string; firstName: string }[] }>(
      await app.inject({ method: "GET", url: "/dashboard/parent", headers: parent.headers }),
    );
    const aarav = home.children.find((c) => c.firstName === "Aarav")!;
    const batches = json<{ id: string; name: string }[]>(await app.inject({ method: "GET", url: "/batches", headers: teacher.headers }));
    const jee = batches.find((b) => b.name.includes("JEE"))!;
    const subjects = json<{ id: string; name: string }[]>(
      await app.inject({ method: "GET", url: "/subjects", headers: teacher.headers }),
    );
    const physics = subjects.find((s) => s.name === "Physics")!;
    const student = await prisma.student.findFirst({ where: { id: aarav.id } });
    await prisma.studentInsight.deleteMany({ where: { studentId: aarav.id, type: "ACADEMIC_IMPROVEMENT" } });
    for (const [date, marks] of [
      ["2026-07-11", 70],
      ["2026-07-12", 71],
      ["2026-07-13", 72],
      ["2026-07-14", 73],
      ["2026-08-11", 84],
      ["2026-08-12", 85],
      ["2026-08-13", 86],
      ["2026-08-14", 87],
    ] as const) {
      const assessment = await app.inject({
        method: "POST",
        url: "/assessments",
        headers: teacher.headers,
        payload: {
          name: `Insight ${date}`,
          batchId: jee.id,
          subjectId: physics.id,
          date,
          maxMarks: 100,
          passingMarks: 35,
        },
      });
      expect(assessment.statusCode, assessment.body).toBe(201);
      const id = json<{ id: string }>(assessment).id;
      const results = await app.inject({
        method: "POST",
        url: `/assessments/${id}/results`,
        headers: teacher.headers,
        payload: { results: [{ studentId: aarav.id, marks }] },
      });
      expect(results.statusCode, results.body).toBe(200);
    }
    await runStudentInsights({ institutionId: student!.institutionId, studentIds: [aarav.id], asOf });
    const row = await prisma.studentInsight.findFirst({
      where: { studentId: aarav.id, type: "ACADEMIC_IMPROVEMENT" },
    });
    expect(row?.summary).toMatch(/improved from /);
  });
});
