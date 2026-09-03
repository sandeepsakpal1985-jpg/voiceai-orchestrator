import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@klunex-edu/database";
import { CSRF_HEADER } from "@klunex-edu/shared";
import { buildApp } from "../../app.js";
import { can } from "../identity/policies.js";

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

describe("billing RBAC", () => {
  it("restricts billing permissions by role", () => {
    expect(can("SUPER_ADMIN", "billing:write")).toBe(true);
    expect(can("INSTITUTION_ADMIN", "billing:read")).toBe(true);
    expect(can("INSTITUTION_ADMIN", "billing:write")).toBe(false);
    expect(can("TEACHER", "billing:read")).toBe(false);
    expect(can("STAFF", "billing:read")).toBe(false);
    expect(can("STUDENT", "billing:read")).toBe(false);
    expect(can("PARENT", "billing:read")).toBe(false);
    expect(can("PARENT", "fees:read")).toBe(true);
  });
});

describe("billing isolation", () => {
  it("lets an institution admin see own subscription and 404s tenant B records", async () => {
    const own = await app.inject({ method: "GET", url: "/billing/subscription", headers: adminA.headers });
    expect(own.statusCode, own.body).toBe(200);
    const view = json<{ billableStudents: number; subscription: { planCode: string; studentUnitPricePaise: number }; economics: { grossPaise: number } }>(own);
    expect(view.subscription.planCode).toBe("PARTNER");
    expect(view.billableStudents).toBeGreaterThan(0);
    expect(view.economics.grossPaise).toBe(view.billableStudents * view.subscription.studentUnitPricePaise);

    const invoices = json<{ items: { id: string; totalPaise: number }[] }>(
      await app.inject({ method: "GET", url: "/billing/invoices", headers: adminA.headers }),
    );
    expect(invoices.items.length).toBeGreaterThan(0);
    const foreign = await app.inject({
      method: "GET",
      url: `/billing/invoices/${invoices.items[0]!.id}`,
      headers: adminB.headers,
    });
    expect(foreign.statusCode).toBe(404);

    const teacherDenied = await app.inject({ method: "GET", url: "/billing/subscription", headers: teacherA.headers });
    expect(teacherDenied.statusCode).toBe(403);
    const parentDenied = await app.inject({ method: "GET", url: "/billing/subscription", headers: parentA.headers });
    expect(parentDenied.statusCode).toBe(403);
    const parentPay = await app.inject({
      method: "POST",
      url: "/billing/payments",
      headers: parentA.headers,
      payload: { invoiceId: invoices.items[0]!.id, amountPaise: 1, dedupeKey: "x" },
    });
    expect(parentPay.statusCode).toBeGreaterThanOrEqual(400);
  });

  it("does not let a parent inspect another child's entitlement or tenant B fees", async () => {
    const home = json<{ children: { id: string; firstName: string }[] }>(
      await app.inject({ method: "GET", url: "/dashboard/parent", headers: parentA.headers }),
    );
    const aarav = home.children.find((c) => c.firstName === "Aarav")!;
    const own = await app.inject({ method: "GET", url: `/billing/entitlements/${aarav.id}`, headers: parentA.headers });
    expect(own.statusCode).toBe(200);
    const teacherEnt = await app.inject({ method: "GET", url: `/billing/entitlements/${aarav.id}`, headers: teacherA.headers });
    expect(teacherEnt.statusCode).toBe(404);

    const parentB = await login("parent-b@example.test");
    const bHome = json<{ snapshot: { student: { id: string } } }>(
      await app.inject({ method: "GET", url: "/dashboard/parent", headers: parentB.headers }),
    );
    const cross = await app.inject({
      method: "GET",
      url: `/billing/entitlements/${bHome.snapshot.student.id}`,
      headers: parentA.headers,
    });
    expect(cross.statusCode).toBe(404);
    const fees = await app.inject({
      method: "GET",
      url: `/fees?studentId=${bHome.snapshot.student.id}`,
      headers: parentA.headers,
    });
    expect(fees.statusCode).toBe(404);
  });
});

describe("billing invoices and payments", () => {
  it("issues invoices idempotently and records payments without rewriting totals", async () => {
    const sub = json<{ institution: { id: string } }>(
      await app.inject({ method: "GET", url: "/billing/subscription", headers: adminA.headers }),
    );
    const first = await app.inject({
      method: "POST",
      url: "/billing/invoices/issue",
      headers: superA.headers,
      payload: { institutionId: sub.institution.id, periodStart: "2026-10-01", periodEnd: "2027-09-30" },
    });
    expect(first.statusCode, first.body).toBe(200);
    const invoice = json<{ id: string; totalPaise: number; paidPaise: number; dedupeKey: string }>(first);
    const originalTotal = invoice.totalPaise;
    const again = await app.inject({
      method: "POST",
      url: "/billing/invoices/issue",
      headers: superA.headers,
      payload: { institutionId: sub.institution.id, periodStart: "2026-10-01", periodEnd: "2027-09-30" },
    });
    expect(json<{ id: string }>(again).id).toBe(invoice.id);

    const payKey = `test-pay-${invoice.id}-${Date.now()}`;
    const pay = await app.inject({
      method: "POST",
      url: "/billing/payments",
      headers: superA.headers,
      payload: { invoiceId: invoice.id, amountPaise: 1000, paymentDate: "2026-10-02", dedupeKey: payKey },
    });
    expect(pay.statusCode, pay.body).toBe(200);
    const payAgain = await app.inject({
      method: "POST",
      url: "/billing/payments",
      headers: superA.headers,
      payload: { invoiceId: invoice.id, amountPaise: 1000, paymentDate: "2026-10-02", dedupeKey: payKey },
    });
    expect(json<{ id: string }>(payAgain).id).toBe(json<{ id: string }>(pay).id);

    const loaded = json<{ totalPaise: number; paidPaise: number; payments: { id: string }[] }>(
      await app.inject({ method: "GET", url: `/billing/invoices/${invoice.id}`, headers: adminA.headers }),
    );
    expect(loaded.totalPaise).toBe(originalTotal);
    expect(loaded.paidPaise).toBe(1000);

    const refund = await app.inject({
      method: "POST",
      url: "/billing/refunds",
      headers: superA.headers,
      payload: {
        invoiceId: invoice.id,
        paymentId: json<{ id: string }>(pay).id,
        amountPaise: 1000,
        dedupeKey: `test-refund-${invoice.id}-${Date.now()}`,
      },
    });
    expect(refund.statusCode, refund.body).toBe(200);
    const afterRefund = json<{ totalPaise: number; paidPaise: number }>(
      await app.inject({ method: "GET", url: `/billing/invoices/${invoice.id}`, headers: adminA.headers }),
    );
    expect(afterRefund.totalPaise).toBe(originalTotal);
    expect(afterRefund.paidPaise).toBe(0);
  });

  it("computes expired status from asOf without waiting", async () => {
    const future = await app.inject({
      method: "GET",
      url: "/billing/subscription?asOf=2028-04-01",
      headers: adminA.headers,
    });
    expect(future.statusCode).toBe(200);
    expect(json<{ subscription: { status: string } }>(future).subscription.status).toBe("EXPIRED");
  });

  it("lets super admin read the partner report and denies institution admin", async () => {
    const report = await app.inject({ method: "GET", url: "/billing/report", headers: superA.headers });
    expect(report.statusCode, report.body).toBe(200);
    const body = json<{ totals: { institutions: number; billableStudents: number }; rows: { institution: string }[] }>(report);
    expect(body.totals.institutions).toBeGreaterThanOrEqual(2);
    expect(body.rows.some((r) => r.institution.includes("Demo"))).toBe(true);
    const denied = await app.inject({ method: "GET", url: "/billing/report", headers: adminA.headers });
    expect(denied.statusCode).toBe(403);
  });
});
