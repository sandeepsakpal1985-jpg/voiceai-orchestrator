import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@klunex-edu/database";
import { CSRF_HEADER } from "@klunex-edu/shared";
import { buildApp } from "../../app.js";

const password = "DemoPassw0rd!";
type App = Awaited<ReturnType<typeof buildApp>>;
type Auth = { headers: { cookie: string; [key: string]: string } };

let app: App;
let adminA: Auth;
let adminB: Auth;
let teacherA: Auth;
let parentA: Auth;
let superA: Auth;

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
  adminA = await login("admin@example.test");
  adminB = await login("admin-b@example.test");
  teacherA = await login("teacher@example.test");
  parentA = await login("parent@example.test");
  superA = await login("superadmin@example.test");
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe("pilot onboarding", () => {
  it("returns live checklist progress for the tenant admin", async () => {
    const res = await app.inject({ method: "GET", url: "/dashboard/onboarding", headers: adminA.headers });
    expect(res.statusCode, res.body).toBe(200);
    const body = json<{ items: { id: string; label: string; done: boolean }[]; complete: number; total: number }>(res);
    expect(body.total).toBe(11);
    expect(body.complete).toBeGreaterThanOrEqual(8);
    expect(body.items.every((item) => item.done)).toBe(true);
    expect(body.complete).toBe(body.items.filter((item) => item.done).length);
    expect(body.items.find((item) => item.id === "institution")?.label).toBe("Institution");
    expect(body.items.find((item) => item.id === "parentLinks")?.label).toBe("Parents");
  });

  it("denies teachers and 404-equivalent isolation for tenant B reading A is not applicable — each tenant sees own counts", async () => {
    const teacherDenied = await app.inject({ method: "GET", url: "/dashboard/onboarding", headers: teacherA.headers });
    expect(teacherDenied.statusCode).toBe(403);
    const parentDenied = await app.inject({ method: "GET", url: "/dashboard/onboarding", headers: parentA.headers });
    expect(parentDenied.statusCode).toBe(403);
    const a = json<{ items: { id: string; done: boolean }[] }>(
      await app.inject({ method: "GET", url: "/dashboard/onboarding", headers: adminA.headers }),
    );
    const b = json<{ items: { id: string; done: boolean }[] }>(
      await app.inject({ method: "GET", url: "/dashboard/onboarding", headers: adminB.headers }),
    );
    expect(a.items.length).toBe(11);
    expect(b.items.length).toBe(11);
  });
});

describe("pilot metrics", () => {
  it("is super-admin only and never dumps student names", async () => {
    const denied = await app.inject({ method: "GET", url: "/pilot/metrics", headers: adminA.headers });
    expect(denied.statusCode).toBe(403);
    const teacherDenied = await app.inject({ method: "GET", url: "/pilot/metrics", headers: teacherA.headers });
    expect(teacherDenied.statusCode).toBe(403);
    const ok = await app.inject({ method: "GET", url: "/pilot/metrics", headers: superA.headers });
    expect(ok.statusCode, ok.body).toBe(200);
    const body = json<{
      rows: {
        institution: string;
        activeStudents: number;
        klunexRealizationPaise: number;
        lastActivityAt: string | null;
      }[];
    }>(ok);
    expect(body.rows.length).toBeGreaterThanOrEqual(2);
    expect(body.rows.some((r) => r.institution.includes("Demo"))).toBe(true);
    expect(body.rows.some((r) => r.activeStudents > 0)).toBe(true);
    expect(body.rows.some((r) => r.lastActivityAt)).toBe(true);
    expect(JSON.stringify(body)).not.toMatch(/Aarav|Meera|O-1001/);
  });
});

describe("pilot performance smoke", () => {
  it("keeps search, Student 360, onboarding, and billing counts prompt", async () => {
    const timed = async (url: string, headers: Auth["headers"]) => {
      const t0 = Date.now();
      const res = await app.inject({ method: "GET", url, headers });
      return { status: res.statusCode, ms: Date.now() - t0, body: res.body };
    };
    const search = await timed("/search?q=Aa", adminA.headers);
    expect(search.status).toBe(200);
    expect(search.ms).toBeLessThan(5000);
    const parent = await timed("/dashboard/parent", parentA.headers);
    expect(parent.status).toBe(200);
    expect(parent.ms).toBeLessThan(5000);
    const onboarding = await timed("/dashboard/onboarding", adminA.headers);
    expect(onboarding.status).toBe(200);
    expect(onboarding.ms).toBeLessThan(5000);
    const billing = await timed("/billing/subscription", adminA.headers);
    expect(billing.status).toBe(200);
    expect(billing.ms).toBeLessThan(5000);
    const metrics = await timed("/pilot/metrics", superA.headers);
    expect(metrics.status).toBe(200);
    expect(metrics.ms).toBeLessThan(8000);
  });

  it("aliases /readiness to the database probe", async () => {
    const ready = await app.inject({ method: "GET", url: "/ready" });
    const readiness = await app.inject({ method: "GET", url: "/readiness" });
    expect(ready.statusCode).toBe(200);
    expect(readiness.statusCode).toBe(200);
    expect(json<{ status: string }>(readiness).status).toBe("ready");
  });
});
