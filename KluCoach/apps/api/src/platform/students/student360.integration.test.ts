import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@klunex-edu/database";
import { CSRF_HEADER, student360Schema } from "@klunex-edu/shared";
import { buildApp } from "../../app.js";

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

describe("student 360 authorization", () => {
  it("lets a parent read own children and denies unrelated and tenant B students", async () => {
    const home = await app.inject({ method: "GET", url: "/dashboard/parent", headers: parentA.headers });
    expect(home.statusCode, home.body).toBe(200);
    const body = json<{ children: { id: string; firstName: string }[]; snapshot: unknown }>(home);
    expect(body.children.some((c) => c.firstName === "Aarav")).toBe(true);
    expect(body.children.some((c) => c.firstName === "Diya")).toBe(true);
    const aarav = body.children.find((c) => c.firstName === "Aarav")!;
    const diya = body.children.find((c) => c.firstName === "Diya")!;
    const own = await app.inject({ method: "GET", url: `/students/${aarav.id}/360`, headers: parentA.headers });
    expect(own.statusCode).toBe(200);
    expect(student360Schema.safeParse(own.json()).success).toBe(true);
    const sibling = await app.inject({ method: "GET", url: `/students/${diya.id}/360`, headers: parentA.headers });
    expect(sibling.statusCode).toBe(200);
    const bStudents = json<{ id: string }[]>(await app.inject({ method: "GET", url: "/students", headers: b.headers }));
    const cross = await app.inject({ method: "GET", url: `/students/${bStudents[0]!.id}/360`, headers: parentA.headers });
    expect(cross.statusCode).toBe(404);
    const bogus = await app.inject({ method: "GET", url: "/students/not-a-real-child/360", headers: parentA.headers });
    expect(bogus.statusCode).toBe(404);
    const query = await app.inject({
      method: "GET",
      url: `/dashboard/parent?studentId=${bStudents[0]!.id}`,
      headers: parentA.headers,
    });
    expect(query.statusCode).toBe(404);
  });

  it("lets a student read only their own 360", async () => {
    const student = await login("student@example.test");
    const selfDash = await app.inject({ method: "GET", url: "/dashboard/student", headers: student.headers });
    expect(selfDash.statusCode, selfDash.body).toBe(200);
    const me = json<{ student: { id: string } }>(selfDash);
    const own = await app.inject({ method: "GET", url: `/students/${me.student.id}/360`, headers: student.headers });
    expect(own.statusCode).toBe(200);
    const others = json<{ id: string }[]>(await app.inject({ method: "GET", url: "/students", headers: a.headers }));
    const other = others.find((s) => s.id !== me.student.id)!;
    const denied = await app.inject({ method: "GET", url: `/students/${other.id}/360`, headers: student.headers });
    expect(denied.statusCode).toBe(404);
  });

  it("lets a teacher read assigned-batch students and denies unassigned same-tenant students", async () => {
    const students = json<{ id: string; firstName: string }[]>(await app.inject({ method: "GET", url: "/students", headers: a.headers }));
    const aarav = students.find((s) => s.firstName === "Aarav")!;
    const ok = await app.inject({ method: "GET", url: `/students/${aarav.id}/360`, headers: teacherA.headers });
    expect(ok.statusCode, ok.body).toBe(200);
    const branches = json<{ id: string }[]>(await app.inject({ method: "GET", url: "/branches", headers: a.headers }));
    const years = json<{ id: string }[]>(await app.inject({ method: "GET", url: "/academic-years", headers: a.headers }));
    const programs = json<{ id: string }[]>(await app.inject({ method: "GET", url: "/programs", headers: a.headers }));
    const batch = await app.inject({
      method: "POST",
      url: "/batches",
      headers: a.headers,
      payload: {
        name: `360 Unassigned ${Date.now()}`,
        branchId: branches[0]!.id,
        academicYearId: years[0]!.id,
        programId: programs[0]!.id,
      },
    });
    expect(batch.statusCode, batch.body).toBe(201);
    const created = json<{ id: string }>(batch);
    const lone = await app.inject({
      method: "POST",
      url: "/students",
      headers: a.headers,
      payload: {
        firstName: "Nila",
        lastName: "Shah",
        admissionNumber: `360-${Date.now()}`,
        branchId: branches[0]!.id,
        batchId: created.id,
      },
    });
    expect(lone.statusCode, lone.body).toBe(201);
    const denied = await app.inject({
      method: "GET",
      url: `/students/${json<{ id: string }>(lone).id}/360`,
      headers: teacherA.headers,
    });
    expect(denied.statusCode).toBe(404);
  });

  it("lets an admin read in-tenant 360 and 404s tenant B", async () => {
    const home = json<{ children: { id: string; firstName: string }[] }>(
      await app.inject({ method: "GET", url: "/dashboard/parent", headers: parentA.headers }),
    );
    const aarav = home.children.find((c) => c.firstName === "Aarav")!;
    const ok = await app.inject({ method: "GET", url: `/students/${aarav.id}/360`, headers: a.headers });
    expect(ok.statusCode).toBe(200);
    const parsed = student360Schema.safeParse(ok.json());
    expect(parsed.success, parsed.success ? "" : parsed.error.toString()).toBe(true);
    if (parsed.success) {
      expect(parsed.data.attendance.percent).not.toBe(0);
      expect(parsed.data.academic.latest.length).toBeGreaterThan(0);
      expect(parsed.data.academic.latest.some((r) => r.assessment.subject.name === "Physics")).toBe(true);
      expect(parsed.data.notices.length).toBeGreaterThan(0);
      expect(parsed.data.upcoming.some((u) => u.subject.name === "Physics")).toBe(true);
      expect(parsed.data.assignments.items.some((a) => a.title.includes("Motion"))).toBe(true);
      expect(parsed.data.fees).not.toBeNull();
    }
    const bStudents = json<{ id: string }[]>(await app.inject({ method: "GET", url: "/students", headers: b.headers }));
    const cross = await app.inject({ method: "GET", url: `/students/${bStudents[0]!.id}/360`, headers: a.headers });
    expect(cross.statusCode).toBe(404);
  });
});

describe("student 360 empty states", () => {
  it("does not invent doing well or 0% when a student has no academic data", async () => {
    const branches = json<{ id: string }[]>(await app.inject({ method: "GET", url: "/branches", headers: a.headers }));
    const years = json<{ id: string }[]>(await app.inject({ method: "GET", url: "/academic-years", headers: a.headers }));
    const programs = json<{ id: string }[]>(await app.inject({ method: "GET", url: "/programs", headers: a.headers }));
    const batch = await app.inject({
      method: "POST",
      url: "/batches",
      headers: a.headers,
      payload: {
        name: `360 Empty ${Date.now()}`,
        branchId: branches[0]!.id,
        academicYearId: years[0]!.id,
        programId: programs[0]!.id,
      },
    });
    expect(batch.statusCode, batch.body).toBe(201);
    const created = await app.inject({
      method: "POST",
      url: "/students",
      headers: a.headers,
      payload: {
        firstName: "Empty",
        lastName: "State",
        admissionNumber: `empty-${Date.now()}`,
        branchId: branches[0]!.id,
        batchId: json<{ id: string }>(batch).id,
      },
    });
    expect(created.statusCode, created.body).toBe(201);
    const res = await app.inject({
      method: "GET",
      url: `/students/${json<{ id: string }>(created).id}/360`,
      headers: a.headers,
    });
    expect(res.statusCode).toBe(200);
    const snapshot = json<{
      summary: { status: string };
      attendance: { percent: number | null; recent: unknown[] };
      academic: { average: number | null; latest: unknown[] };
      fees: unknown;
    }>(res);
    expect(snapshot.summary.status).toBe("INSUFFICIENT_DATA");
    expect(snapshot.attendance.percent).toBeNull();
    expect(snapshot.academic.average).toBeNull();
    expect(snapshot.academic.latest).toEqual([]);
    expect(snapshot.fees).toBeNull();
  });
});
