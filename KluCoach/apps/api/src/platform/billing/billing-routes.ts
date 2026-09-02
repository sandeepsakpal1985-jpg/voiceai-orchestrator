import type { FastifyInstance } from "fastify";
import { prisma } from "@klunex-edu/database";
import { notFound, validationError } from "../../lib/errors.js";
import { requirePermission, requireSuperAdmin, requireTenant, requireUser } from "../identity/http-auth.js";
import { writeAudit } from "../audit/write.js";
import { assertStudent360Access } from "../identity/scope.js";
import {
  applyLifecycle,
  createTenantSubscription,
  issueSubscriptionInvoice,
  partnerReport,
  recordManualPayment,
  recordRefund,
  renewTenantSubscription,
  subscriptionView,
} from "./billing-service.js";
import { getEntitlementStatus, entitleStudent } from "./entitlement-service.js";

function asOfFrom(query: { asOf?: string }) {
  if (!query.asOf) return new Date();
  const d = new Date(query.asOf);
  if (Number.isNaN(d.getTime())) throw validationError("Invalid asOf");
  return d;
}

export async function billingRoutes(app: FastifyInstance) {
  app.get("/billing/subscription", async (req) => {
    const tenant = requireTenant(req);
    requirePermission(req, "billing:read");
    const asOf = asOfFrom(req.query as { asOf?: string });
    const view = await subscriptionView(tenant.institutionId, asOf);
    if (!view) throw notFound();
    return view;
  });

  app.get("/billing/invoices", async (req) => {
    const tenant = requireTenant(req);
    requirePermission(req, "billing:read");
    const query = req.query as { page?: string; pageSize?: string };
    const page = Math.max(1, Number(query.page ?? 1) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(query.pageSize ?? 20) || 20));
    const where = { institutionId: tenant.institutionId };
    const [items, total] = await Promise.all([
      prisma.billingInvoice.findMany({
        where,
        include: { lines: true },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.billingInvoice.count({ where }),
    ]);
    return { items, total, page, pageSize };
  });

  app.get("/billing/invoices/:id", async (req) => {
    const user = requireUser(req);
    requirePermission(req, "billing:read");
    const { id } = req.params as { id: string };
    const row =
      user.role === "SUPER_ADMIN"
        ? await prisma.billingInvoice.findUnique({ where: { id }, include: { lines: true, payments: true, refunds: true } })
        : await prisma.billingInvoice.findFirst({
            where: { id, institutionId: user.institutionId ?? "__none__" },
            include: { lines: true, payments: true, refunds: true },
          });
    if (!row) throw notFound();
    return row;
  });

  app.get("/billing/entitlements/:studentId", async (req) => {
    const tenant = requireTenant(req);
    if (tenant.role === "TEACHER" || tenant.role === "STAFF") throw notFound();
    const { studentId } = req.params as { studentId: string };
    await assertStudent360Access(tenant, studentId);
    const asOf = asOfFrom(req.query as { asOf?: string });
    const status = await getEntitlementStatus(studentId, asOf);
    return { studentId, ...status };
  });

  app.post("/billing/invoices/issue", async (req) => {
    requireSuperAdmin(req);
    const body = req.body as { institutionId?: string; periodStart?: string; periodEnd?: string };
    if (!body.institutionId || !body.periodStart || !body.periodEnd) throw validationError("institutionId, periodStart, periodEnd required");
    const invoice = await issueSubscriptionInvoice({
      institutionId: body.institutionId,
      periodStart: new Date(body.periodStart),
      periodEnd: new Date(body.periodEnd),
      req,
    });
    return invoice;
  });

  app.post("/billing/payments", async (req) => {
    requireSuperAdmin(req);
    const body = req.body as { invoiceId?: string; amountPaise?: number; paymentDate?: string; dedupeKey?: string };
    if (!body.invoiceId || !body.amountPaise || !body.dedupeKey) throw validationError("invoiceId, amountPaise, dedupeKey required");
    const invoice = await prisma.billingInvoice.findUnique({ where: { id: body.invoiceId } });
    if (!invoice) throw notFound();
    const payment = await recordManualPayment({
      institutionId: invoice.institutionId,
      invoiceId: invoice.id,
      amountPaise: body.amountPaise,
      paymentDate: body.paymentDate ? new Date(body.paymentDate) : new Date(),
      dedupeKey: body.dedupeKey,
      req,
    });
    return payment;
  });

  app.post("/billing/refunds", async (req) => {
    requireSuperAdmin(req);
    const body = req.body as { invoiceId?: string; paymentId?: string; amountPaise?: number; reason?: string; dedupeKey?: string };
    if (!body.invoiceId || !body.paymentId || !body.amountPaise || !body.dedupeKey) {
      throw validationError("invoiceId, paymentId, amountPaise, dedupeKey required");
    }
    const refund = await recordRefund({
      invoiceId: body.invoiceId,
      paymentId: body.paymentId,
      amountPaise: body.amountPaise,
      reason: body.reason,
      dedupeKey: body.dedupeKey,
      req,
    });
    if (!refund) throw notFound();
    return refund;
  });

  app.get("/billing/report", async (req) => {
    requireSuperAdmin(req);
    requirePermission(req, "billing:read");
    const asOf = asOfFrom(req.query as { asOf?: string });
    return partnerReport(asOf);
  });

  app.get("/billing/report.csv", async (req, reply) => {
    requireSuperAdmin(req);
    const asOf = asOfFrom(req.query as { asOf?: string });
    const report = await partnerReport(asOf);
    const header = [
      "institution",
      "billingMode",
      "commercialMode",
      "plan",
      "status",
      "billableStudents",
      "studentUnitPricePaise",
      "grossPaise",
      "klunexRealizationPaise",
      "partnerSharePaise",
      "renewalDate",
      "invoicedPaise",
      "paidPaise",
      "outstandingPaise",
    ];
    const lines = [header.join(",")];
    for (const r of report.rows) {
      lines.push(
        [
          JSON.stringify(r.institution),
          r.billingMode,
          r.commercialMode ?? "",
          JSON.stringify(r.plan ?? ""),
          r.status ?? "",
          r.billableStudents,
          r.studentUnitPricePaise,
          r.grossPaise,
          r.klunexRealizationPaise,
          r.partnerSharePaise,
          r.renewalDate ?? "",
          r.invoicedPaise,
          r.paidPaise,
          r.outstandingPaise,
        ].join(","),
      );
    }
    return reply.header("content-type", "text/csv; charset=utf-8").send(lines.join("\n"));
  });

  app.get("/billing/plans", async (req) => {
    requireSuperAdmin(req);
    return prisma.subscriptionPlan.findMany({ orderBy: { code: "asc" } });
  });

  app.post("/billing/plans", async (req) => {
    requireSuperAdmin(req);
    const body = req.body as {
      code?: string;
      name?: string;
      listPricePaise?: number;
      amountPaisePerStudentYear?: number;
      klunexSharePaise?: number;
      partnerSharePaise?: number;
      commercialMode?: string;
    };
    if (!body.code || !body.name || body.amountPaisePerStudentYear == null || body.klunexSharePaise == null || body.partnerSharePaise == null) {
      throw validationError("code, name, and price fields required");
    }
    const plan = await prisma.subscriptionPlan.create({
      data: {
        code: body.code,
        name: body.name,
        listPricePaise: body.listPricePaise ?? body.amountPaisePerStudentYear,
        amountPaisePerStudentYear: body.amountPaisePerStudentYear,
        klunexSharePaise: body.klunexSharePaise,
        partnerSharePaise: body.partnerSharePaise,
        commercialMode: body.commercialMode ?? "PARTNER",
      },
    });
    await writeAudit(req, "billing.plan.create", "SubscriptionPlan", plan.id);
    return plan;
  });

  app.patch("/billing/plans/:id", async (req) => {
    requireSuperAdmin(req);
    const { id } = req.params as { id: string };
    const body = req.body as { isActive?: boolean; name?: string };
    const plan = await prisma.subscriptionPlan.findUnique({ where: { id } });
    if (!plan) throw notFound();
    const updated = await prisma.subscriptionPlan.update({
      where: { id },
      data: {
        ...(body.isActive != null ? { isActive: body.isActive } : {}),
        ...(body.name ? { name: body.name } : {}),
      },
    });
    await writeAudit(req, "billing.plan.update", "SubscriptionPlan", updated.id);
    return updated;
  });

  app.post("/billing/subscriptions", async (req) => {
    requireSuperAdmin(req);
    const body = req.body as { institutionId?: string; planId?: string; startsAt?: string; endsAt?: string; renewalDate?: string };
    if (!body.institutionId || !body.planId || !body.startsAt || !body.endsAt || !body.renewalDate) {
      throw validationError("institutionId, planId, startsAt, endsAt, renewalDate required");
    }
    const inst = await prisma.institution.findUnique({ where: { id: body.institutionId } });
    if (!inst) throw notFound();
    const sub = await createTenantSubscription({
      institutionId: inst.id,
      planId: body.planId,
      startsAt: new Date(body.startsAt),
      endsAt: new Date(body.endsAt),
      renewalDate: new Date(body.renewalDate),
    });
    const students = await prisma.student.findMany({ where: { institutionId: inst.id, archivedAt: null }, select: { id: true } });
    for (const s of students) await entitleStudent(inst.id, s.id);
    await writeAudit(req, "billing.subscription.create", "TenantSubscription", sub.id);
    return sub;
  });

  app.post("/billing/subscriptions/renew", async (req) => {
    requireSuperAdmin(req);
    const body = req.body as { institutionId?: string; planId?: string; startsAt?: string; endsAt?: string; renewalDate?: string };
    if (!body.institutionId || !body.startsAt || !body.endsAt || !body.renewalDate) {
      throw validationError("institutionId, startsAt, endsAt, renewalDate required");
    }
    const sub = await renewTenantSubscription(body.institutionId, {
      planId: body.planId,
      startsAt: new Date(body.startsAt),
      endsAt: new Date(body.endsAt),
      renewalDate: new Date(body.renewalDate),
    });
    await writeAudit(req, "billing.subscription.renew", "TenantSubscription", sub.id);
    return sub;
  });

  app.post("/billing/lifecycle/apply", async (req) => {
    requireSuperAdmin(req);
    const body = (req.body as { asOf?: string }) ?? {};
    const asOf = body.asOf ? new Date(body.asOf) : new Date();
    const result = await applyLifecycle(asOf);
    await writeAudit(req, "billing.lifecycle.apply", "TenantSubscription", "platform", { asOf: result.asOf });
    return result;
  });

  app.get("/billing/config", async (req) => {
    requireSuperAdmin(req);
    return prisma.platformBillingConfig.findUnique({ where: { id: "platform" } });
  });

  app.patch("/billing/config", async (req) => {
    requireSuperAdmin(req);
    const body = req.body as { gracePeriodDays?: number; currency?: string; billingPeriod?: string; billableStudentStatuses?: string[] };
    const row = await prisma.platformBillingConfig.upsert({
      where: { id: "platform" },
      create: {
        id: "platform",
        gracePeriodDays: body.gracePeriodDays ?? 7,
        currency: body.currency ?? "INR",
        billingPeriod: body.billingPeriod ?? "ANNUAL",
        billableStudentStatuses: body.billableStudentStatuses ?? ["ACTIVE"],
      },
      update: {
        ...(body.gracePeriodDays != null ? { gracePeriodDays: body.gracePeriodDays } : {}),
        ...(body.currency ? { currency: body.currency } : {}),
        ...(body.billingPeriod ? { billingPeriod: body.billingPeriod } : {}),
        ...(body.billableStudentStatuses ? { billableStudentStatuses: body.billableStudentStatuses } : {}),
      },
    });
    await writeAudit(req, "billing.config.update", "PlatformBillingConfig", row.id);
    return row;
  });
}
