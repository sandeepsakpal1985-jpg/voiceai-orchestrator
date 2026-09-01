import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@klunex-edu/database";
import { CSRF_HEADER } from "@klunex-edu/shared";
import { buildApp } from "../../app.js";

const password = "DemoPassw0rd!";

type App = Awaited<ReturnType<typeof buildApp>>;
type Auth = { headers: { cookie: string; [key: string]: string } };

let app: App;
let a: Auth;
let b: Auth;
let teacherA: Auth;

async function login(email: string): Promise<Auth> {
  const res = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email, password },
  });
  expect(res.statusCode, res.body).toBe(200);
  const body = res.json() as { csrfToken: string };
  const cookies = res.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
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
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for integration tests");
  }
  app = await buildApp();
  a = await login("admin@example.test");
  b = await login("admin-b@example.test");
  teacherA = await login("teacher@example.test");
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe("teacher isolation", () => {
  it("blocks retrieve/update of tenant B teacher", async () => {
    const list = await app.inject({ method: "GET", url: "/teachers", headers: b.headers });
    expect(list.statusCode).toBe(200);
    const other = json<{ id: string; employeeId: string | null }[]>(list)[0];
    expect(other?.id).toBeTruthy();
    const get = await app.inject({ method: "GET", url: `/teachers/${other.id}`, headers: a.headers });
    expect(get.statusCode).toBe(404);
    const patch = await app.inject({
      method: "PATCH",
      url: `/teachers/${other.id}`,
      headers: a.headers,
      payload: { name: "Hijacked" },
    });
    expect(patch.statusCode).toBe(404);
    const teacherProbe = await app.inject({ method: "GET", url: `/teachers/${other.id}`, headers: teacherA.headers });
    expect(teacherProbe.statusCode).toBe(404);
  });

  it("search never returns tenant B teacher employee ids", async () => {
    const probe = await app.inject({ method: "GET", url: "/search?q=T-2001", headers: a.headers });
    expect(probe.statusCode).toBe(200);
    expect(JSON.stringify(probe.json())).not.toContain("T-2001");
  });

  it("cannot attach tenant B batches when creating a teacher", async () => {
    const batches = json<{ id: string }[]>(await app.inject({ method: "GET", url: "/batches", headers: b.headers }));
    const res = await app.inject({
      method: "POST",
      url: "/teachers",
      headers: a.headers,
      payload: { name: "Cross Tenant", batchIds: [batches[0]!.id] },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe("assignment isolation", () => {
  it("blocks retrieve and batch-filter of tenant B assignments", async () => {
    const list = await app.inject({ method: "GET", url: "/assignments", headers: b.headers });
    expect(list.statusCode).toBe(200);
    const other = json<{ id: string; batchId: string }[]>(list)[0];
    expect(other?.id).toBeTruthy();
    const get = await app.inject({ method: "GET", url: `/assignments/${other.id}`, headers: a.headers });
    expect(get.statusCode).toBe(404);
    const filter = await app.inject({
      method: "GET",
      url: `/assignments?batchId=${other.batchId}`,
      headers: a.headers,
    });
    expect(filter.statusCode).toBe(404);
    const parentA = await login("parent@example.test");
    const parentProbe = await app.inject({ method: "GET", url: `/assignments/${other.id}`, headers: parentA.headers });
    expect(parentProbe.statusCode).toBe(404);
  });

  it("cannot create an assignment on a tenant B batch", async () => {
    const batches = json<{ id: string }[]>(await app.inject({ method: "GET", url: "/batches", headers: b.headers }));
    const subjects = json<{ id: string }[]>(await app.inject({ method: "GET", url: "/subjects", headers: a.headers }));
    const res = await app.inject({
      method: "POST",
      url: "/assignments",
      headers: a.headers,
      payload: {
        title: "Cross tenant homework",
        subjectId: subjects[0]!.id,
        batchId: batches[0]!.id,
        dueAt: "2026-12-01",
      },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe("notice isolation", () => {
  it("blocks retrieve of tenant B notices", async () => {
    const list = await app.inject({ method: "GET", url: "/notices", headers: b.headers });
    expect(list.statusCode).toBe(200);
    const other = json<{ id: string; title: string }[]>(list)[0];
    expect(other?.id).toBeTruthy();
    const get = await app.inject({ method: "GET", url: `/notices/${other.id}`, headers: a.headers });
    expect(get.statusCode).toBe(404);
    const aList = await app.inject({ method: "GET", url: "/notices", headers: a.headers });
    const ids = json<{ id: string }[]>(aList).map((n) => n.id);
    expect(ids).not.toContain(other.id);
  });

  it("cannot target tenant B students or batches in a notice", async () => {
    const students = json<{ id: string }[]>(await app.inject({ method: "GET", url: "/students", headers: b.headers }));
    const batches = json<{ id: string }[]>(await app.inject({ method: "GET", url: "/batches", headers: b.headers }));
    const byStudent = await app.inject({
      method: "POST",
      url: "/notices",
      headers: a.headers,
      payload: { title: "Nope", body: "Nope", audience: "STUDENTS", studentIds: [students[0]!.id] },
    });
    expect(byStudent.statusCode).toBe(404);
    const byBatch = await app.inject({
      method: "POST",
      url: "/notices",
      headers: a.headers,
      payload: { title: "Nope", body: "Nope", audience: "BATCH", batchId: batches[0]!.id },
    });
    expect(byBatch.statusCode).toBe(404);
  });
});

describe("report and export isolation", () => {
  it("student CSV export never contains tenant B admission numbers or branches", async () => {
    const res = await app.inject({ method: "GET", url: "/reports/students.csv", headers: a.headers });
    expect(res.statusCode).toBe(200);
    const csv = res.body;
    expect(csv).not.toContain("O-1001");
    expect(csv).not.toContain("Pune Camp");
    expect(csv).toContain("D-1001");
  });

  it("attendance CSV export stays in-tenant", async () => {
    const res = await app.inject({ method: "GET", url: "/reports/attendance.csv", headers: a.headers });
    expect(res.statusCode).toBe(200);
    expect(res.body).not.toContain("O-1001");
  });

  it("parent-activation CSV export stays in-tenant", async () => {
    const res = await app.inject({ method: "GET", url: "/reports/parent-activation.csv", headers: a.headers });
    expect(res.statusCode).toBe(200);
    expect(res.body).not.toContain("+910000002222");
  });
});

describe("invitation isolation", () => {
  it("cannot invite a tenant B student into tenant A", async () => {
    const students = json<{ id: string }[]>(await app.inject({ method: "GET", url: "/students", headers: b.headers }));
    const res = await app.inject({
      method: "POST",
      url: "/invitations",
      headers: a.headers,
      payload: { type: "STUDENT", email: "cross@example.test", studentId: students[0]!.id },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe("authentication responses", () => {
  it("uses the same 401 message for unknown emails and bad passwords", async () => {
    const unknown = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "nobody@example.test", password: "wrong-password-xx" },
    });
    const known = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "admin@example.test", password: "wrong-password-xx" },
    });
    expect(unknown.statusCode).toBe(401);
    expect(known.statusCode).toBe(401);
    expect(unknown.json()).toEqual(known.json());
  });
});

describe("domain resource isolation", () => {
  it("blocks tenant B branch, program, subject, batch, and parent by id", async () => {
    const branch = json<{ id: string }[]>(await app.inject({ method: "GET", url: "/branches", headers: b.headers }))[0];
    const program = json<{ id: string }[]>(await app.inject({ method: "GET", url: "/programs", headers: b.headers }))[0];
    const subject = json<{ id: string }[]>(await app.inject({ method: "GET", url: "/subjects", headers: b.headers }))[0];
    const batch = json<{ id: string }[]>(await app.inject({ method: "GET", url: "/batches", headers: b.headers }))[0];
    const parent = json<{ id: string }[]>(await app.inject({ method: "GET", url: "/parents", headers: b.headers }))[0];
    expect((await app.inject({ method: "GET", url: `/branches/${branch.id}`, headers: a.headers })).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: `/programs/${program.id}`, headers: a.headers })).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: `/subjects/${subject.id}`, headers: a.headers })).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: `/batches/${batch.id}`, headers: a.headers })).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: `/parents/${parent.id}`, headers: a.headers })).statusCode).toBe(404);
  });
});
