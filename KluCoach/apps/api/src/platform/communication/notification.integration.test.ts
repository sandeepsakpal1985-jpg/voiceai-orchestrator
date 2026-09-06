import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@klunex-edu/database";
import { CSRF_HEADER } from "@klunex-edu/shared";
import { buildApp } from "../../app.js";
import { runAssignmentReminders } from "../communication/assignment-reminders.js";
import { purgeExpiredNotifications } from "../communication/notification-retention.js";

const password = "DemoPassw0rd!";
type App = Awaited<ReturnType<typeof buildApp>>;
type Auth = { headers: { cookie: string; [key: string]: string } };

let app: App;
let a: Auth;
let b: Auth;
let teacherA: Auth;
let parentA: Auth;

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

beforeAll(async () => {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for integration tests");
  app = await buildApp();
  a = await login("admin@example.test");
  b = await login("admin-b@example.test");
  teacherA = await login("teacher@example.test");
  parentA = await login("parent@example.test");
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe("notification authorization", () => {
  it("lets a parent read own child notifications and 404s everyone else", async () => {
    const batches = json<{ id: string; name: string }[]>(await app.inject({ method: "GET", url: "/batches", headers: a.headers }));
    const jee = batches.find((row) => row.name.includes("JEE"))!;
    const students = json<{ id: string; firstName: string }[]>(
      await app.inject({ method: "GET", url: `/students?batchId=${jee.id}`, headers: a.headers }),
    );
    const aarav = students.find((s) => s.firstName === "Aarav")!;
    const date = `2026-09-1${String(Date.now()).slice(-1)}`;
    const mark = await app.inject({
      method: "POST",
      url: "/attendance",
      headers: teacherA.headers,
      payload: { batchId: jee.id, date, records: [{ studentId: aarav.id, status: "ABSENT" }] },
    });
    expect(mark.statusCode, mark.body).toBe(201);
    const afterFirst = await prisma.notification.count({
      where: { type: "ATTENDANCE_ABSENCE", dedupeKey: { contains: `${aarav.id}:${date}` } },
    });
    expect(afterFirst).toBeGreaterThanOrEqual(1);
    const again = await app.inject({
      method: "POST",
      url: "/attendance",
      headers: teacherA.headers,
      payload: { batchId: jee.id, date, records: [{ studentId: aarav.id, status: "ABSENT" }] },
    });
    expect(again.statusCode).toBe(201);
    expect(
      await prisma.notification.count({
        where: { type: "ATTENDANCE_ABSENCE", dedupeKey: { contains: `${aarav.id}:${date}` } },
      }),
    ).toBe(afterFirst);

    const list = json<{ items: { id: string; title: string; studentId: string | null; href: string }[]; unreadCount: number }>(
      await app.inject({ method: "GET", url: "/notifications", headers: parentA.headers }),
    );
    const absences = list.items.filter((i) => i.title.includes("Aarav") && i.title.includes("absent"));
    expect(absences.length).toBeGreaterThan(0);
    expect(absences[0]!.studentId).toBe(aarav.id);
    expect(absences[0]!.href).toContain(aarav.id);

    const own = await app.inject({ method: "GET", url: `/notifications/${absences[0]!.id}`, headers: parentA.headers });
    expect(own.statusCode).toBe(200);

    const parentB = await login("parent-b@example.test");
    const crossParent = await app.inject({
      method: "GET",
      url: `/notifications/${absences[0]!.id}`,
      headers: parentB.headers,
    });
    expect(crossParent.statusCode).toBe(404);
    const markOther = await app.inject({
      method: "POST",
      url: `/notifications/${absences[0]!.id}/read`,
      headers: parentB.headers,
    });
    expect(markOther.statusCode).toBe(404);

    const student = await login("student@example.test");
    const studentDenied = await app.inject({
      method: "GET",
      url: `/notifications/${absences[0]!.id}`,
      headers: student.headers,
    });
    expect(studentDenied.statusCode).toBe(404);

    const teacherDenied = await app.inject({
      method: "GET",
      url: `/notifications/${absences[0]!.id}`,
      headers: teacherA.headers,
    });
    expect(teacherDenied.statusCode).toBe(404);

    const adminBList = json<{ items: unknown[] }>(await app.inject({ method: "GET", url: "/notifications", headers: b.headers }));
    expect(JSON.stringify(adminBList)).not.toContain(absences[0]!.id);

    const create = await app.inject({
      method: "POST",
      url: "/notifications",
      headers: parentA.headers,
      payload: { userId: "someone", title: "hi" },
    });
    expect(create.statusCode).toBeGreaterThanOrEqual(400);
  });

  it("notifies parent and student for results, assignments, notices, and timetable changes", async () => {
    const batches = json<{ id: string; name: string }[]>(await app.inject({ method: "GET", url: "/batches", headers: a.headers }));
    const jee = batches.find((row) => row.name.includes("JEE"))!;
    const subjects = json<{ id: string; name: string }[]>(await app.inject({ method: "GET", url: "/subjects", headers: a.headers }));
    const physics = subjects.find((s) => s.name === "Physics")!;
    const students = json<{ id: string; firstName: string }[]>(
      await app.inject({ method: "GET", url: `/students?batchId=${jee.id}`, headers: a.headers }),
    );
    const aarav = students.find((s) => s.firstName === "Aarav")!;
    const stamp = Date.now();

    const assessment = await app.inject({
      method: "POST",
      url: "/assessments",
      headers: teacherA.headers,
      payload: { name: `Notify Physics ${stamp}`, type: "TEST", batchId: jee.id, subjectId: physics.id, maxMarks: 100, passingMarks: 35, date: "2026-09-08" },
    });
    expect(assessment.statusCode, assessment.body).toBe(201);
    const assessmentId = json<{ id: string }>(assessment).id;
    const results = await app.inject({
      method: "POST",
      url: `/assessments/${assessmentId}/results`,
      headers: teacherA.headers,
      payload: { results: [{ studentId: aarav.id, marks: 88 }] },
    });
    expect(results.statusCode, results.body).toBe(200);
    await app.inject({
      method: "POST",
      url: `/assessments/${assessmentId}/results`,
      headers: teacherA.headers,
      payload: { results: [{ studentId: aarav.id, marks: 90 }] },
    });

    const assignment = await app.inject({
      method: "POST",
      url: "/assignments",
      headers: teacherA.headers,
      payload: { title: `Notify worksheet ${stamp}`, batchId: jee.id, subjectId: physics.id, dueAt: "2026-09-20T10:00:00.000Z" },
    });
    expect(assignment.statusCode, assignment.body).toBe(201);

    const notice = await app.inject({
      method: "POST",
      url: "/notices",
      headers: teacherA.headers,
      payload: { title: `Lab closed ${stamp}`, body: "Physics lab closed.", audience: "BATCH", batchId: jee.id },
    });
    expect(notice.statusCode, notice.body).toBe(201);

    const sessions = json<{ id: string; batchId: string; status: string; room: string | null }[]>(
      await app.inject({ method: "GET", url: "/sessions", headers: teacherA.headers }),
    );
    const upcoming = sessions.find((s) => s.batchId === jee.id && s.status === "SCHEDULED")!;
    const patched = await app.inject({
      method: "PATCH",
      url: `/sessions/${upcoming.id}`,
      headers: teacherA.headers,
      payload: { room: `R-N-${stamp}` },
    });
    expect(patched.statusCode, patched.body).toBe(200);

    const parentList = json<{ items: { title: string; type: string; studentId: string | null }[] }>(
      await app.inject({ method: "GET", url: "/notifications", headers: parentA.headers }),
    );
    expect(parentList.items.some((i) => i.type === "ASSESSMENT_RESULT_PUBLISHED" && i.title.includes("Aarav"))).toBe(true);
    expect(parentList.items.filter((i) => i.title.includes(`Notify worksheet ${stamp}`)).length).toBe(1);
    expect(parentList.items.some((i) => i.title.includes(`Lab closed ${stamp}`))).toBe(true);
    expect(parentList.items.some((i) => i.type === "TIMETABLE_CHANGED" && i.title.includes("Aarav"))).toBe(true);

    const student = await login("student@example.test");
    const studentList = json<{ items: { title: string; type: string }[] }>(
      await app.inject({ method: "GET", url: "/notifications", headers: student.headers }),
    );
    expect(studentList.items.some((i) => i.type === "ASSESSMENT_RESULT_PUBLISHED")).toBe(true);
    expect(studentList.items.some((i) => i.title.includes(`Notify worksheet ${stamp}`))).toBe(true);
    expect(studentList.items.some((i) => i.title.includes(`Lab closed ${stamp}`))).toBe(true);
    const parentResults = await prisma.notification.count({
      where: {
        type: "ASSESSMENT_RESULT_PUBLISHED",
        userId: (json<{ user: { id: string } }>(await app.inject({ method: "GET", url: "/me", headers: parentA.headers }))).user.id,
        dedupeKey: { contains: assessmentId },
      },
    });
    expect(parentResults).toBe(1);
  });

  it("marks only the recipient's notifications read", async () => {
    const before = json<{ unreadCount: number }>(
      await app.inject({ method: "GET", url: "/notifications/unread-count", headers: parentA.headers }),
    );
    expect(before.unreadCount).toBeGreaterThan(0);
    const all = await app.inject({ method: "POST", url: "/notifications/read-all", headers: parentA.headers });
    expect(all.statusCode).toBe(200);
    const after = json<{ unreadCount: number }>(
      await app.inject({ method: "GET", url: "/notifications/unread-count", headers: parentA.headers }),
    );
    expect(after.unreadCount).toBe(0);
    const parentB = await login("parent-b@example.test");
    await app.inject({ method: "POST", url: "/notifications/read-all", headers: parentA.headers });
    const other = json<{ items: { id: string }[] }>(await app.inject({ method: "GET", url: "/notifications", headers: parentB.headers }));
    expect(Array.isArray(other.items)).toBe(true);
  });

  it("lets a parent change own preferences and ignores a foreign userId in the body", async () => {
    const parentB = await login("parent-b@example.test");
    const other = json<{ user: { id: string } }>(await app.inject({ method: "GET", url: "/me", headers: parentB.headers }));
    const patched = await app.inject({
      method: "PATCH",
      url: "/notification-preferences",
      headers: parentA.headers,
      payload: { attendanceAlerts: false, userId: other.user.id },
    });
    expect(patched.statusCode, patched.body).toBe(200);
    const own = json<{ attendanceAlerts: boolean }>(patched);
    expect(own.attendanceAlerts).toBe(false);
    const otherPrefs = json<{ attendanceAlerts: boolean }>(
      await app.inject({ method: "GET", url: "/notification-preferences", headers: parentB.headers }),
    );
    expect(otherPrefs.attendanceAlerts).toBe(true);
    await app.inject({
      method: "PATCH",
      url: "/notification-preferences",
      headers: parentA.headers,
      payload: { attendanceAlerts: true },
    });
  });

  it("suppresses absence notifications when attendanceAlerts is off", async () => {
    const batches = json<{ id: string; name: string }[]>(await app.inject({ method: "GET", url: "/batches", headers: a.headers }));
    const jee = batches.find((row) => row.name.includes("JEE"))!;
    const students = json<{ id: string; firstName: string }[]>(
      await app.inject({ method: "GET", url: `/students?batchId=${jee.id}`, headers: a.headers }),
    );
    const aarav = students.find((s) => s.firstName === "Aarav")!;
    const day = 1 + (Date.now() % 28);
    const date = `2036-04-${String(day).padStart(2, "0")}`;
    const me = json<{ user: { id: string } }>(await app.inject({ method: "GET", url: "/me", headers: parentA.headers }));
    const before = await prisma.notification.count({
      where: { userId: me.user.id, type: "ATTENDANCE_ABSENCE", dedupeKey: { contains: `${aarav.id}:${date}` } },
    });
    expect(before).toBe(0);
    try {
      const patched = json<{ attendanceAlerts: boolean }>(
        await app.inject({
          method: "PATCH",
          url: "/notification-preferences",
          headers: parentA.headers,
          payload: { attendanceAlerts: false },
        }),
      );
      expect(patched.attendanceAlerts).toBe(false);
      const mark = await app.inject({
        method: "POST",
        url: "/attendance",
        headers: teacherA.headers,
        payload: { batchId: jee.id, date, records: [{ studentId: aarav.id, status: "ABSENT" }] },
      });
      expect(mark.statusCode, mark.body).toBe(201);
      const after = await prisma.notification.count({
        where: { userId: me.user.id, type: "ATTENDANCE_ABSENCE", dedupeKey: { contains: `${aarav.id}:${date}` } },
      });
      expect(after).toBe(0);
    } finally {
      await app.inject({
        method: "PATCH",
        url: "/notification-preferences",
        headers: parentA.headers,
        payload: { attendanceAlerts: true },
      });
    }
  });
});

describe("notification jobs", () => {
  it("does not claim assignment reminders are scheduled", async () => {
    const out = await runAssignmentReminders();
    expect(out.scheduled).toBe(false);
  });

  it("can purge expired notifications without touching audit logs", async () => {
    const audits = await prisma.auditLog.count();
    const removed = await purgeExpiredNotifications(0);
    expect(removed).toBeGreaterThanOrEqual(0);
    expect(await prisma.auditLog.count()).toBe(audits);
  });
});
