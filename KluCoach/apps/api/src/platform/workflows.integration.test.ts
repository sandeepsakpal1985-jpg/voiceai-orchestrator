import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@klunex-edu/database";
import { CSRF_HEADER } from "@klunex-edu/shared";
import { buildApp } from "../app.js";

const password = "DemoPassw0rd!";

type App = Awaited<ReturnType<typeof buildApp>>;
type Auth = { headers: { cookie: string; [key: string]: string } };

let app: App;
let a: Auth;
let b: Auth;
let teacherA: Auth;
let parentA: Auth;

async function login(email: string): Promise<Auth> {
  const res = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email, password },
  });
  expect(res.statusCode, res.body).toBe(200);
  const body = res.json() as { csrfToken: string };
  const cookies = res.cookies.map((c: { name: string; value: string }) => `${c.name}=${c.value}`).join("; ");
  return {
    headers: {
      cookie: cookies,
      [CSRF_HEADER]: body.csrfToken,
    },
  };
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

describe("invitation lifecycle", () => {
  it("rejects invalid tokens without revealing whether the invite existed", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/invitations/accept",
      payload: { token: "a".repeat(24), password: "InvitePassw0rd!", firstName: "New", lastName: "Parent" },
    });
    expect(res.statusCode).toBe(401);
    expect(json<{ error: { message: string } }>(res).error.message).toMatch(/invalid or expired/i);
  });

  it("cannot be reused after activation and expired tokens are rejected", async () => {
    const students = json<{ id: string }[]>(await app.inject({ method: "GET", url: "/students", headers: a.headers }));
    const student = students.find((s) => s.id)!;
    const linkedBefore = await prisma.student.findFirst({ where: { id: student.id }, select: { userId: true } });
    const email = `invite-cycle-${Date.now()}@example.test`;
    const created = await app.inject({
      method: "POST",
      url: "/invitations",
      headers: a.headers,
      payload: { type: "PARENT", email, studentId: student.id },
    });
    expect(created.statusCode, created.body).toBe(201);
    const invite = json<{ id: string; token: string }>(created);

    const first = await app.inject({
      method: "POST",
      url: "/auth/invitations/accept",
      payload: { token: invite.token, password: "InvitePassw0rd!", firstName: "Nisha", lastName: "Patel" },
    });
    expect(first.statusCode, first.body).toBe(200);
    const linkedAfter = await prisma.student.findFirst({ where: { id: student.id }, select: { userId: true } });
    expect(linkedAfter?.userId).toBe(linkedBefore?.userId);

    const reuse = await app.inject({
      method: "POST",
      url: "/auth/invitations/accept",
      payload: { token: invite.token, password: "InvitePassw0rd!", firstName: "Nisha", lastName: "Patel" },
    });
    expect(reuse.statusCode).toBe(401);

    const expiredEmail = `invite-exp-${Date.now()}@example.test`;
    const expiredCreate = await app.inject({
      method: "POST",
      url: "/invitations",
      headers: a.headers,
      payload: { type: "PARENT", email: expiredEmail, studentId: student.id },
    });
    expect(expiredCreate.statusCode).toBe(201);
    const expired = json<{ id: string; token: string }>(expiredCreate);
    await prisma.invitation.update({ where: { id: expired.id }, data: { expiresAt: new Date("2020-01-01") } });
    const expiredAccept = await app.inject({
      method: "POST",
      url: "/auth/invitations/accept",
      payload: { token: expired.token, password: "InvitePassw0rd!", firstName: "Old", lastName: "Invite" },
    });
    expect(expiredAccept.statusCode).toBe(401);
  });

  it("invitation list and parent search stay in-tenant", async () => {
    const list = await app.inject({ method: "GET", url: "/invitations?page=1&pageSize=25", headers: a.headers });
    expect(list.statusCode).toBe(200);
    const payload = json<{ items: { email: string | null }[] }>(list);
    expect(JSON.stringify(payload)).not.toContain("parent-b@example.test");
    const parents = await app.inject({ method: "GET", url: "/parents?q=Priya&page=1", headers: a.headers });
    expect(parents.statusCode).toBe(200);
    expect(JSON.stringify(parents.json())).not.toContain("+910000002222");
    const bParents = json<{ id: string }[]>(await app.inject({ method: "GET", url: "/parents", headers: b.headers }));
    const bStudents = json<{ id: string }[]>(await app.inject({ method: "GET", url: "/students", headers: b.headers }));
    const link = await app.inject({
      method: "POST",
      url: `/parents/${bParents[0]!.id}/children`,
      headers: a.headers,
      payload: { studentId: bStudents[0]!.id },
    });
    expect(link.statusCode).toBe(404);
  });
});

describe("assessment marks validation", () => {
  it("rejects marks above max and negative marks, and publishes valid results", async () => {
    const batches = json<{ id: string; name: string }[]>(await app.inject({ method: "GET", url: "/batches", headers: a.headers }));
    const subjects = json<{ id: string; name: string }[]>(await app.inject({ method: "GET", url: "/subjects", headers: a.headers }));
    const jee = batches.find((b) => b.name.includes("JEE"))!;
    const physics = subjects.find((s) => s.name === "Physics")!;
    const roster = json<{ id: string; firstName: string }[]>(
      await app.inject({ method: "GET", url: `/students?batchId=${jee.id}`, headers: a.headers }),
    );
    const aarav = roster.find((s) => s.firstName === "Aarav")!;
    const created = await app.inject({
      method: "POST",
      url: "/assessments",
      headers: teacherA.headers,
      payload: {
        name: `Vitest marks ${Date.now()}`,
        subjectId: physics.id,
        batchId: jee.id,
        date: "2026-09-01",
        maxMarks: 100,
        passingMarks: 35,
      },
    });
    expect(created.statusCode, created.body).toBe(201);
    const assessment = json<{ id: string }>(created);

    const over = await app.inject({
      method: "POST",
      url: `/assessments/${assessment.id}/results`,
      headers: teacherA.headers,
      payload: { results: [{ studentId: aarav.id, marks: 101 }] },
    });
    expect(over.statusCode).toBe(400);

    const negative = await app.inject({
      method: "POST",
      url: `/assessments/${assessment.id}/results`,
      headers: teacherA.headers,
      payload: { results: [{ studentId: aarav.id, marks: -1 }] },
    });
    expect(negative.statusCode).toBe(400);

    const ok = await app.inject({
      method: "POST",
      url: `/assessments/${assessment.id}/results`,
      headers: teacherA.headers,
      payload: { results: [{ studentId: aarav.id, marks: 88 }] },
    });
    expect(ok.statusCode, ok.body).toBe(200);
  });

  it("blocks tenant A from creating or reading tenant B assessments", async () => {
    const bBatches = json<{ id: string }[]>(await app.inject({ method: "GET", url: "/batches", headers: b.headers }));
    const aSubjects = json<{ id: string }[]>(await app.inject({ method: "GET", url: "/subjects", headers: a.headers }));
    const create = await app.inject({
      method: "POST",
      url: "/assessments",
      headers: teacherA.headers,
      payload: {
        name: "Cross tenant test",
        subjectId: aSubjects[0]!.id,
        batchId: bBatches[0]!.id,
        date: "2026-09-01",
        maxMarks: 100,
        passingMarks: 35,
      },
    });
    expect(create.statusCode).toBe(404);

    const bAssessments = json<{ id: string }[]>(await app.inject({ method: "GET", url: "/assessments", headers: b.headers }));
    const get = await app.inject({ method: "GET", url: `/assessments/${bAssessments[0]!.id}`, headers: a.headers });
    expect(get.statusCode).toBe(404);
    const parentGet = await app.inject({
      method: "GET",
      url: `/assessments/${bAssessments[0]!.id}`,
      headers: parentA.headers,
    });
    expect(parentGet.statusCode).toBe(404);
    const parentResults = await app.inject({
      method: "GET",
      url: `/results?assessmentId=${bAssessments[0]!.id}`,
      headers: parentA.headers,
    });
    expect(parentResults.statusCode).toBe(404);
  });
});

describe("teacher batch authorization", () => {
  it("denies attendance on a tenant batch the teacher is not assigned to", async () => {
    const branches = json<{ id: string }[]>(await app.inject({ method: "GET", url: "/branches", headers: a.headers }));
    const years = json<{ id: string }[]>(await app.inject({ method: "GET", url: "/academic-years", headers: a.headers }));
    const programs = json<{ id: string }[]>(await app.inject({ method: "GET", url: "/programs", headers: a.headers }));
    const batch = await app.inject({
      method: "POST",
      url: "/batches",
      headers: a.headers,
      payload: {
        name: `Unassigned ${Date.now()}`,
        branchId: branches[0]!.id,
        academicYearId: years[0]!.id,
        programId: programs[0]!.id,
      },
    });
    expect(batch.statusCode, batch.body).toBe(201);
    const created = json<{ id: string }>(batch);
    const students = json<{ id: string }[]>(await app.inject({ method: "GET", url: "/students", headers: a.headers }));
    const mark = await app.inject({
      method: "POST",
      url: "/attendance",
      headers: teacherA.headers,
      payload: {
        batchId: created.id,
        date: "2026-09-01",
        records: [{ studentId: students[0]!.id, status: "PRESENT" }],
      },
    });
    expect(mark.statusCode).toBe(403);
    const teacherBatches = json<{ id: string }[]>(await app.inject({ method: "GET", url: "/batches", headers: teacherA.headers }));
    expect(teacherBatches.map((row) => row.id)).not.toContain(created.id);
  });
});

describe("paged list isolation", () => {
  it("student and teacher pages never include tenant B identifiers", async () => {
    const students = await app.inject({ method: "GET", url: "/students?page=1&pageSize=50&q=O-", headers: a.headers });
    expect(students.statusCode).toBe(200);
    expect(JSON.stringify(students.json())).not.toContain("O-1001");
    const teachers = await app.inject({ method: "GET", url: "/teachers?page=1&q=T-2001", headers: a.headers });
    expect(teachers.statusCode).toBe(200);
    expect(JSON.stringify(teachers.json())).not.toContain("T-2001");
    const batches = await app.inject({ method: "GET", url: "/batches?page=1&q=Pune", headers: a.headers });
    expect(batches.statusCode).toBe(200);
    expect(JSON.stringify(batches.json())).not.toContain("Pune Camp");
  });
});

describe("attendance upsert and isolation", () => {
  it("updates the same student/date instead of inserting duplicates", async () => {
    const batches = json<{ id: string; name: string }[]>(await app.inject({ method: "GET", url: "/batches", headers: a.headers }));
    const jee = batches.find((b) => b.name.includes("JEE"))!;
    const roster = json<{ id: string; firstName: string }[]>(
      await app.inject({ method: "GET", url: `/students?batchId=${jee.id}`, headers: a.headers }),
    );
    const aarav = roster.find((s) => s.firstName === "Aarav")!;
    const date = "2026-09-04";
    const first = await app.inject({
      method: "POST",
      url: "/attendance",
      headers: teacherA.headers,
      payload: { batchId: jee.id, date, records: [{ studentId: aarav.id, status: "PRESENT" }] },
    });
    expect(first.statusCode, first.body).toBe(201);
    const second = await app.inject({
      method: "POST",
      url: "/attendance",
      headers: teacherA.headers,
      payload: { batchId: jee.id, date, records: [{ studentId: aarav.id, status: "ABSENT" }] },
    });
    expect(second.statusCode).toBe(201);
    const forStudent = json<{ studentId: string; status: string }[]>(
      await app.inject({ method: "GET", url: `/attendance?studentId=${aarav.id}&date=${date}`, headers: a.headers }),
    );
    const aaravRows = forStudent.filter((r) => r.studentId === aarav.id);
    expect(aaravRows).toHaveLength(1);
    expect(aaravRows[0]!.status).toBe("ABSENT");
    const audit = await prisma.auditLog.findFirst({
      where: { action: "attendance.mark", entityId: jee.id },
      orderBy: { createdAt: "desc" },
    });
    expect(audit?.userId).toBeTruthy();
    expect(audit?.institutionId).toBeTruthy();
    expect(audit?.action).toBe("attendance.mark");
    expect(audit?.createdAt).toBeTruthy();
  });

  it("cannot mark tenant B attendance from tenant A", async () => {
    const bBatches = json<{ id: string }[]>(await app.inject({ method: "GET", url: "/batches", headers: b.headers }));
    const aStudents = json<{ id: string }[]>(await app.inject({ method: "GET", url: "/students", headers: a.headers }));
    const res = await app.inject({
      method: "POST",
      url: "/attendance",
      headers: teacherA.headers,
      payload: {
        batchId: bBatches[0]!.id,
        date: "2026-09-04",
        records: [{ studentId: aStudents[0]!.id, status: "PRESENT" }],
      },
    });
    expect(res.statusCode).toBe(404);
    const get = await app.inject({
      method: "GET",
      url: `/attendance?batchId=${bBatches[0]!.id}`,
      headers: teacherA.headers,
    });
    expect(get.statusCode).toBe(404);
  });
});

describe("timetable isolation", () => {
  it("blocks retrieve and update of tenant B timetable slots and sessions", async () => {
    const slots = json<{ id: string }[]>(await app.inject({ method: "GET", url: "/timetable", headers: b.headers }));
    const sessions = json<{ id: string }[]>(await app.inject({ method: "GET", url: "/sessions", headers: b.headers }));
    expect(slots[0]?.id).toBeTruthy();
    expect(sessions[0]?.id).toBeTruthy();
    expect((await app.inject({ method: "GET", url: `/timetable/${slots[0]!.id}`, headers: a.headers })).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: `/sessions/${sessions[0]!.id}`, headers: a.headers })).statusCode).toBe(404);
    expect(
      (
        await app.inject({
          method: "PATCH",
          url: `/timetable/${slots[0]!.id}`,
          headers: a.headers,
          payload: { room: "Hijack" },
        })
      ).statusCode,
    ).toBe(404);
    const aPaged = await app.inject({ method: "GET", url: "/timetable?page=1&q=Pune", headers: a.headers });
    expect(aPaged.statusCode).toBe(200);
    expect(JSON.stringify(aPaged.json())).not.toContain("Pune Camp");
  });

  it("cannot create a timetable slot on a tenant B batch", async () => {
    const bBatches = json<{ id: string }[]>(await app.inject({ method: "GET", url: "/batches", headers: b.headers }));
    const aSubjects = json<{ id: string }[]>(await app.inject({ method: "GET", url: "/subjects", headers: a.headers }));
    const res = await app.inject({
      method: "POST",
      url: "/timetable",
      headers: a.headers,
      payload: {
        batchId: bBatches[0]!.id,
        subjectId: aSubjects[0]!.id,
        dayOfWeek: "FRIDAY",
        startMinute: 16 * 60,
        endMinute: 17 * 60,
      },
    });
    expect(res.statusCode).toBe(404);
  });

  it("cannot create a class session on a tenant B batch", async () => {
    const bBatches = json<{ id: string }[]>(await app.inject({ method: "GET", url: "/batches", headers: b.headers }));
    const aSubjects = json<{ id: string }[]>(await app.inject({ method: "GET", url: "/subjects", headers: a.headers }));
    const res = await app.inject({
      method: "POST",
      url: "/sessions",
      headers: a.headers,
      payload: {
        batchId: bBatches[0]!.id,
        subjectId: aSubjects[0]!.id,
        date: "2026-09-10",
        startMinute: 17 * 60,
        endMinute: 18 * 60,
      },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe("assignment submit isolation", () => {
  it("lets a student submit their own assignment and rejects parent impersonation", async () => {
    const student = await login("student@example.test");
    const listed = await app.inject({ method: "GET", url: "/assignments", headers: student.headers });
    expect(listed.statusCode, listed.body).toBe(200);
    const payload = json<{ id: string; title: string; submissions: { status: string }[] }[] | { items: { id: string; title: string; submissions: { status: string }[] }[] }>(listed);
    const list = Array.isArray(payload) ? payload : payload.items;
    const homework = list.find((row) => row.title.includes("Motion")) ?? list[0]!;
    const submitted = await app.inject({
      method: "POST",
      url: `/assignments/${homework.id}/submit`,
      headers: student.headers,
      payload: { status: "SUBMITTED" },
    });
    expect(submitted.statusCode, submitted.body).toBe(200);
    const parentSubmit = await app.inject({
      method: "POST",
      url: `/assignments/${homework.id}/submit`,
      headers: parentA.headers,
      payload: { status: "SUBMITTED" },
    });
    expect(parentSubmit.statusCode).toBe(403);
    const bList = json<{ id: string }[]>(await app.inject({ method: "GET", url: "/assignments", headers: b.headers }));
    const cross = await app.inject({
      method: "POST",
      url: `/assignments/${bList[0]!.id}/submit`,
      headers: student.headers,
      payload: { status: "SUBMITTED" },
    });
    expect(cross.statusCode).toBe(404);
    const patch = await app.inject({
      method: "PATCH",
      url: `/assignments/${bList[0]!.id}`,
      headers: a.headers,
      payload: { title: "Hijacked" },
    });
    expect(patch.statusCode).toBe(404);
  });
});

