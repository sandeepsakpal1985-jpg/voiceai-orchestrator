import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@klunex-edu/database";
import { CSRF_HEADER } from "@klunex-edu/shared";
import { buildApp } from "../../app.js";
import { emailOutbox } from "../communication/email-transport.js";
import { processSignedWebhook } from "../payments/service.js";
import { razorpaySignature } from "../payments/razorpay-provider.js";
import { webhookSecretNow } from "../payments/factory.js";
import { runNamedJob, JOB_NAMES } from "../../jobs/runner.js";

const password = "DemoPassw0rd!";
type App = Awaited<ReturnType<typeof buildApp>>;
type Auth = { headers: { cookie: string; [key: string]: string } };

let app: App;
let adminA: Auth;
let adminB: Auth;
let teacherA: Auth;
let superA: Auth;

async function login(email: string, pwd = password): Promise<Auth> {
  const res = await app.inject({ method: "POST", url: "/auth/login", payload: { email, password: pwd } });
  expect(res.statusCode, res.body).toBe(200);
  const body = res.json() as { csrfToken: string };
  const cookies = res.cookies.map((c: { name: string; value: string }) => `${c.name}=${c.value}`).join("; ");
  return { headers: { cookie: cookies, [CSRF_HEADER]: body.csrfToken } };
}

beforeAll(async () => {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for integration tests");
  process.env.PAYMENTS_ENABLED = "true";
  process.env.PAYMENT_PROVIDER = "test";
  process.env.PAYMENT_WEBHOOK_SECRET = "test-webhook-secret";
  process.env.ALLOW_DEV_RESET_TOKEN = "true";
  app = await buildApp();
  adminA = await login("admin@example.test");
  adminB = await login("admin-b@example.test");
  teacherA = await login("teacher@example.test");
  superA = await login("superadmin@example.test");
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe("password reset", () => {
  it("returns a generic message whether or not the email exists", async () => {
    const missing = await app.inject({
      method: "POST",
      url: "/auth/password-reset/request",
      payload: { email: "nobody-on-earth@example.test" },
    });
    expect(missing.statusCode).toBe(200);
    expect(missing.json().message).toMatch(/If the account exists/);
    const known = await app.inject({
      method: "POST",
      url: "/auth/password-reset/request",
      payload: { email: "resetme@example.test" },
    });
    expect(known.statusCode).toBe(200);
    expect(known.json().message).toBe(missing.json().message);
  });

  it("completes with a hashed single-use token and rejects reuse", async () => {
    emailOutbox.length = 0;
    await app.inject({ method: "POST", url: "/auth/password-reset/request", payload: { email: "resetme@example.test" } });
    const mailed = emailOutbox.find((m) => m.to === "resetme@example.test");
    const token = mailed?.text?.match(/token=([A-Za-z0-9_-]+)/)?.[1];
    expect(token).toBeTruthy();
    const stored = await prisma.passwordResetToken.findFirst({
      where: { user: { email: "resetme@example.test" } },
      orderBy: { createdAt: "desc" },
    });
    expect(stored?.tokenHash).not.toBe(token);
    const nextPassword = "ResetPassw0rd!";
    const complete = await app.inject({
      method: "POST",
      url: "/auth/password-reset/complete",
      payload: { token, password: nextPassword },
    });
    expect(complete.statusCode).toBe(200);
    const reuse = await app.inject({
      method: "POST",
      url: "/auth/password-reset/complete",
      payload: { token, password: nextPassword },
    });
    expect(reuse.statusCode).toBe(401);
    const authed = await login("resetme@example.test", nextPassword);
    expect(authed.headers.cookie).toContain("klucoach.sid");
    await app.inject({
      method: "POST",
      url: "/auth/password-reset/request",
      payload: { email: "resetme@example.test" },
    });
    const again = emailOutbox
      .filter((m) => m.to === "resetme@example.test")
      .at(-1)
      ?.text?.match(/token=([A-Za-z0-9_-]+)/)?.[1];
    await app.inject({
      method: "POST",
      url: "/auth/password-reset/complete",
      payload: { token: again, password },
    });
  });

  it("rejects a forged token", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/password-reset/complete",
      payload: { token: "totally-forged-token-value", password: "AnotherPassw0rd" },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe("payment checkout and webhooks", () => {
  let period = 0;
  async function issueOpenInvoice() {
    period += 1;
    const admin = await prisma.user.findFirst({ where: { email: "admin@example.test" } });
    const day = String(10 + (Date.now() % 18)).padStart(2, "0");
    const periodStart = `2026-05-${day}`;
    const periodEnd = `2026-05-${day}`;
    const issued = await app.inject({
      method: "POST",
      url: "/billing/invoices/issue",
      headers: superA.headers,
      payload: { institutionId: admin?.institutionId, periodStart, periodEnd },
    });
    expect(issued.statusCode, issued.body).toBe(200);
    const invoice = issued.json() as { id: string; totalPaise: number; institutionId: string; status: string; paidPaise: number };
    expect(invoice.totalPaise).toBeGreaterThan(0);
    expect(invoice.paidPaise).toBe(0);
    return invoice;
  }

  it("creates a test order from the stored invoice amount and ignores client amounts", async () => {
    const invoice = await issueOpenInvoice();
    const teacherPay = await app.inject({
      method: "POST",
      url: `/billing/invoices/${invoice.id}/pay`,
      headers: teacherA.headers,
    });
    expect(teacherPay.statusCode).toBe(403);
    const foreign = await app.inject({
      method: "POST",
      url: `/billing/invoices/${invoice.id}/pay`,
      headers: adminB.headers,
    });
    expect(foreign.statusCode).toBe(404);
    const checkout = await app.inject({
      method: "POST",
      url: `/billing/invoices/${invoice.id}/pay`,
      headers: adminA.headers,
    });
    expect(checkout.statusCode, checkout.body).toBe(200);
    const session = checkout.json() as { orderId: string; amountPaise: number };
    expect(session.amountPaise).toBe(invoice.totalPaise);
  });

  it("verifies signatures, is idempotent, and does not treat pending as paid", async () => {
    const invoice = await issueOpenInvoice();
    const checkout = await app.inject({
      method: "POST",
      url: `/billing/invoices/${invoice.id}/pay`,
      headers: adminA.headers,
    });
    const session = checkout.json() as { orderId: string; amountPaise: number };
    const bad = await app.inject({
      method: "POST",
      url: "/webhooks/razorpay",
      headers: { "x-razorpay-signature": "deadbeef", "content-type": "application/json" },
      payload: { event: "payment.captured" },
    });
    expect(bad.statusCode).toBe(400);

    const failedPayload = {
      event: "payment.failed",
      payload: {
        payment: {
          entity: {
            id: "pay_fail_1",
            order_id: session.orderId,
            amount: session.amountPaise,
            notes: { invoiceId: invoice.id },
          },
        },
      },
    };
    const failedRaw = JSON.stringify(failedPayload);
    const failedHook = await processSignedWebhook(failedRaw, razorpaySignature(failedRaw, webhookSecretNow()));
    expect(failedHook.statusCode).toBe(200);
    const stillOpen = await prisma.billingInvoice.findUnique({ where: { id: invoice.id } });
    expect(stillOpen?.paidPaise).toBe(0);

    const complete = await app.inject({
      method: "POST",
      url: "/billing/payments/test-complete",
      headers: adminA.headers,
      payload: { orderId: session.orderId, outcome: "SUCCESS" },
    });
    expect(complete.statusCode, complete.body).toBe(200);
    const paid = await prisma.billingInvoice.findUnique({ where: { id: invoice.id } });
    expect(paid?.status).toBe("PAID");
    expect(paid?.paidPaise).toBe(invoice.totalPaise);

    const again = await app.inject({
      method: "POST",
      url: "/billing/payments/test-complete",
      headers: adminA.headers,
      payload: { orderId: session.orderId, outcome: "SUCCESS" },
    });
    expect(again.statusCode).toBe(200);
    const after = await prisma.billingInvoice.findUnique({
      where: { id: invoice.id },
      include: { payments: true },
    });
    expect(after?.paidPaise).toBe(invoice.totalPaise);
    expect(after?.payments.filter((p) => p.status === "SUCCESS").length).toBe(1);
  });

  it("returns 404 for cross-tenant invoice GET", async () => {
    const invoice = await issueOpenInvoice();
    const res = await app.inject({
      method: "GET",
      url: `/billing/invoices/${invoice.id}`,
      headers: adminB.headers,
    });
    expect(res.statusCode).toBe(404);
  });
});

describe("lifecycle job idempotency", () => {
  it("does not insert a second job row for the same hour bucket", async () => {
    const asOf = new Date("2026-09-02T10:15:00.000Z");
    await prisma.jobRun.deleteMany({ where: { dedupeKey: "billing.lifecycle:2026-09-02T10" } });
    const first = await runNamedJob(JOB_NAMES.lifecycle, asOf);
    const second = await runNamedJob(JOB_NAMES.lifecycle, asOf);
    expect(first.skipped).toBe(false);
    expect(second.skipped).toBe(true);
    const rows = await prisma.jobRun.count({ where: { dedupeKey: "billing.lifecycle:2026-09-02T10" } });
    expect(rows).toBe(1);
  });
});
