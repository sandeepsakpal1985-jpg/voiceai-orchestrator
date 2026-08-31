import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@klunex-edu/database";
import { CSRF_HEADER } from "@klunex-edu/shared";
import { buildApp } from "../../app.js";

const password = "DemoPassw0rd!";

type App = Awaited<ReturnType<typeof buildApp>>;

let app: App;

async function login(email: string) {
  const res = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email, password },
  });
  expect(res.statusCode, res.body).toBe(200);
  const body = res.json() as { csrfToken: string };
  const cookies = res.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  return {
    cookies,
    csrf: body.csrfToken,
    headers: {
      cookie: cookies,
      [CSRF_HEADER]: body.csrfToken,
    },
  };
}

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for integration tests");
  }
  app = await buildApp();
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe("authentication", () => {
  it("rejects bad passwords", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "admin@example.test", password: "wrong-password" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("logs in demo admin", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "admin@example.test", password },
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().user.role).toBe("INSTITUTION_ADMIN");
  });
});

describe("tenant isolation", () => {
  it("blocks tenant A admin from reading tenant B student by id", async () => {
    const a = await login("admin@example.test");
    const b = await login("admin-b@example.test");
    const bStudents = await app.inject({ method: "GET", url: "/students", headers: b.headers });
    expect(bStudents.statusCode).toBe(200);
    const other = (bStudents.json() as { id: string }[])[0];
    expect(other?.id).toBeTruthy();
    const probe = await app.inject({
      method: "GET",
      url: `/students/${other.id}`,
      headers: a.headers,
    });
    expect(probe.statusCode).toBe(404);
  });

  it("blocks cross-tenant parent access", async () => {
    const parentA = await login("parent@example.test");
    const adminB = await login("admin-b@example.test");
    const bStudents = await app.inject({ method: "GET", url: "/students", headers: adminB.headers });
    const other = (bStudents.json() as { id: string }[])[0];
    const probe = await app.inject({
      method: "GET",
      url: `/students/${other.id}`,
      headers: parentA.headers,
    });
    expect(probe.statusCode).toBe(404);
  });

  it("blocks cross-tenant attendance query by studentId", async () => {
    const a = await login("admin@example.test");
    const b = await login("admin-b@example.test");
    const bStudents = await app.inject({ method: "GET", url: "/students", headers: b.headers });
    const other = (bStudents.json() as { id: string }[])[0];
    const probe = await app.inject({
      method: "GET",
      url: `/attendance?studentId=${other.id}`,
      headers: a.headers,
    });
    expect(probe.statusCode).toBe(404);
  });

  it("blocks cross-tenant marks via assessment results", async () => {
    const a = await login("admin@example.test");
    const b = await login("admin-b@example.test");
    const bStudents = await app.inject({ method: "GET", url: "/students", headers: b.headers });
    const other = (bStudents.json() as { id: string }[])[0];
    const probe = await app.inject({
      method: "GET",
      url: `/results?studentId=${other.id}`,
      headers: a.headers,
    });
    expect(probe.statusCode).toBe(404);
  });

  it("search never returns the other tenant", async () => {
    const a = await login("admin@example.test");
    const probe = await app.inject({
      method: "GET",
      url: "/search?q=Other",
      headers: a.headers,
    });
    expect(probe.statusCode).toBe(200);
    const body = probe.json() as { batches: { name: string }[]; students: { firstName: string }[] };
    expect(JSON.stringify(body)).not.toContain("Pune Camp");
  });
});

describe("parent workflow", () => {
  it("parent dashboard returns linked children only", async () => {
    const parent = await login("parent@example.test");
    const res = await app.inject({ method: "GET", url: "/dashboard/parent", headers: parent.headers });
    expect(res.statusCode, res.body).toBe(200);
    const body = res.json() as { children: { firstName: string }[]; snapshot: { overall: string } };
    expect(body.children.length).toBeGreaterThan(0);
    expect(body.children.some((c) => c.firstName === "Aarav")).toBe(true);
    expect(body.snapshot.overall).toBeTruthy();
  });
});
