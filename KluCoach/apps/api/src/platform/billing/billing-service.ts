import { prisma } from "@klunex-edu/database";
import { deliverNotification } from "../communication/notification-service.js";
import { notifyInstitutionAdmins } from "../communication/notify.js";
import { writeAudit, writeSystemAudit } from "../audit/write.js";
import type { FastifyRequest } from "fastify";
import {
  countBillableStudents,
  entitleStudent,
  isNonBillableMode,
  loadBillingConfig,
  resolveEntitlementStatus,
  resolveSubscriptionStatus,
} from "./entitlement-service.js";
import { commercialValue, invoiceStatusFromPaid, invoiceTotalPaise, outstandingPaise, timesPaise } from "./pricing.js";

export function snapshotFromPlan(plan: {
  amountPaisePerStudentYear: number;
  klunexSharePaise: number;
  partnerSharePaise: number;
  commercialMode: string;
  currency: string;
}) {
  return {
    studentUnitPricePaise: plan.amountPaisePerStudentYear,
    klunexUnitRealizationPaise: plan.klunexSharePaise,
    partnerUnitSharePaise: plan.partnerSharePaise,
    commercialMode: plan.commercialMode,
    currency: plan.currency,
  };
}

export async function createTenantSubscription(input: {
  institutionId: string;
  planId: string;
  startsAt: Date;
  endsAt: Date;
  renewalDate: Date;
  gracePeriodDays?: number;
}) {
  const plan = await prisma.subscriptionPlan.findUnique({ where: { id: input.planId } });
  if (!plan || !plan.isActive) throw new Error("Plan not found");
  const cfg = await loadBillingConfig();
  const snap = snapshotFromPlan(plan);
  const existing = await prisma.tenantSubscription.findUnique({ where: { institutionId: input.institutionId } });
  if (existing) return existing;
  return prisma.tenantSubscription.create({
    data: {
      institutionId: input.institutionId,
      planId: plan.id,
      status: "ACTIVE",
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      renewalDate: input.renewalDate,
      gracePeriodDays: input.gracePeriodDays ?? cfg.gracePeriodDays,
      ...snap,
    },
  });
}

export async function renewTenantSubscription(institutionId: string, opts?: { planId?: string; startsAt: Date; endsAt: Date; renewalDate: Date }) {
  const current = await prisma.tenantSubscription.findUnique({ where: { institutionId } });
  if (!current) throw new Error("Subscription missing");
  const plan = await prisma.subscriptionPlan.findUnique({ where: { id: opts?.planId ?? current.planId } });
  if (!plan) throw new Error("Plan not found");
  const snap = snapshotFromPlan(plan);
  return prisma.tenantSubscription.update({
    where: { id: current.id },
    data: {
      planId: plan.id,
      status: "ACTIVE",
      startsAt: opts?.startsAt ?? current.startsAt,
      endsAt: opts?.endsAt ?? current.endsAt,
      renewalDate: opts?.renewalDate ?? current.renewalDate,
      ...snap,
    },
  });
}

export async function applyLifecycle(asOf = new Date()) {
  const cfg = await loadBillingConfig();
  const subs = await prisma.tenantSubscription.findMany({
    where: { status: { notIn: ["CANCELLED", "SUSPENDED"] } },
  });
  let updated = 0;
  for (const sub of subs) {
    const next = resolveSubscriptionStatus({
      stored: sub.status,
      endsAt: sub.endsAt,
      gracePeriodDays: sub.gracePeriodDays || cfg.gracePeriodDays,
      asOf,
    });
    if (next !== sub.status) {
      await prisma.tenantSubscription.update({ where: { id: sub.id }, data: { status: next as "ACTIVE" | "PAST_DUE" | "EXPIRED" } });
      updated += 1;
      await writeSystemAudit({
        action: next === "EXPIRED" ? "billing.subscription.expired" : "billing.subscription.changed",
        entityType: "TenantSubscription",
        entityId: sub.id,
        institutionId: sub.institutionId,
        metadata: { from: sub.status, to: next },
      });
      if (next === "EXPIRED") {
        await notifyInstitutionAdmins({
          institutionId: sub.institutionId,
          type: "SUBSCRIPTION_EXPIRED",
          title: "Subscription expired",
          body: "The KluCoach subscription period has ended. Academic records are retained.",
          dedupeKey: `SUBSCRIPTION_EXPIRED:${sub.id}:${asOf.toISOString().slice(0, 10)}`,
        });
      }
    }
    const grace = sub.gracePeriodDays || cfg.gracePeriodDays;
    await prisma.studentEntitlement.updateMany({
      where: {
        subscriptionId: sub.id,
        status: { not: "CANCELLED" },
        endsAt: { not: null, lt: asOf },
      },
      data: { status: "GRACE" },
    });
    const graceEnd = new Date(asOf.getTime() - grace * 24 * 60 * 60 * 1000);
    await prisma.studentEntitlement.updateMany({
      where: {
        subscriptionId: sub.id,
        status: { not: "CANCELLED" },
        endsAt: { not: null, lt: graceEnd },
      },
      data: { status: "EXPIRED" },
    });
  }
  await prisma.billingInvoice.updateMany({
    where: { status: "ISSUED", dueDate: { not: null, lt: asOf } },
    data: { status: "OVERDUE" },
  });
  return { updated, asOf: asOf.toISOString() };
}

export async function subscriptionView(institutionId: string, asOf = new Date()) {
  const institution = await prisma.institution.findUnique({ where: { id: institutionId } });
  if (!institution) return null;
  const sub = await prisma.tenantSubscription.findUnique({
    where: { institutionId },
    include: { plan: true },
  });
  if (!sub) return { institution: { id: institution.id, name: institution.name, billingMode: institution.billingMode }, subscription: null };
  const cfg = await loadBillingConfig();
  const status = resolveSubscriptionStatus({
    stored: sub.status,
    endsAt: sub.endsAt,
    gracePeriodDays: sub.gracePeriodDays || cfg.gracePeriodDays,
    asOf,
  });
  const billableStudents = await countBillableStudents(institutionId, asOf);
  const economics = commercialValue(billableStudents, {
    studentUnitPricePaise: sub.studentUnitPricePaise,
    klunexUnitRealizationPaise: sub.klunexUnitRealizationPaise,
    partnerUnitSharePaise: sub.partnerUnitSharePaise,
  });
  return {
    institution: {
      id: institution.id,
      name: institution.displayName ?? institution.name,
      billingMode: institution.billingMode,
      nonBillable: isNonBillableMode(institution.billingMode),
    },
    subscription: {
      id: sub.id,
      planCode: sub.plan.code,
      planName: sub.plan.name,
      status,
      storedStatus: sub.status,
      commercialMode: sub.commercialMode,
      currency: sub.currency,
      startsAt: sub.startsAt.toISOString(),
      endsAt: sub.endsAt?.toISOString() ?? null,
      renewalDate: sub.renewalDate ? sub.renewalDate.toISOString().slice(0, 10) : null,
      gracePeriodDays: sub.gracePeriodDays,
      studentUnitPricePaise: sub.studentUnitPricePaise,
      klunexUnitRealizationPaise: sub.klunexUnitRealizationPaise,
      partnerUnitSharePaise: sub.partnerUnitSharePaise,
    },
    billableStudents,
    economics,
  };
}

async function nextInvoiceNumber(institutionId: string) {
  const year = new Date().getUTCFullYear();
  const prefix = `KC-${year}-`;
  const last = await prisma.billingInvoice.findFirst({
    where: { institutionId, invoiceNumber: { startsWith: prefix } },
    orderBy: { invoiceNumber: "desc" },
    select: { invoiceNumber: true },
  });
  const n = last ? Number(last.invoiceNumber.slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(n).padStart(4, "0")}`;
}

export async function issueSubscriptionInvoice(input: {
  institutionId: string;
  periodStart: Date;
  periodEnd: Date;
  asOf?: Date;
  req?: FastifyRequest;
}) {
  const sub = await prisma.tenantSubscription.findUnique({ where: { institutionId: input.institutionId }, include: { plan: true } });
  if (!sub) throw new Error("Subscription missing");
  const asOf = input.asOf ?? input.periodEnd;
  const count = await countBillableStudents(input.institutionId, asOf);
  const amount = timesPaise(sub.studentUnitPricePaise, count);
  const total = invoiceTotalPaise(amount, 0, 0);
  const dedupeKey = `issue:${sub.id}:${input.periodStart.toISOString().slice(0, 10)}:${input.periodEnd.toISOString().slice(0, 10)}`;
  const existing = await prisma.billingInvoice.findUnique({
    where: { institutionId_dedupeKey: { institutionId: input.institutionId, dedupeKey } },
    include: { lines: true },
  });
  if (existing) return existing;
  const invoiceNumber = await nextInvoiceNumber(input.institutionId);
  try {
    const created = await prisma.billingInvoice.create({
      data: {
        institutionId: input.institutionId,
        subscriptionId: sub.id,
        invoiceNumber,
        issueDate: asOf,
        dueDate: new Date(asOf.getTime() + 14 * 24 * 60 * 60 * 1000),
        currency: sub.currency,
        subtotalPaise: amount,
        totalPaise: total,
        status: "ISSUED",
        dedupeKey,
        lines: {
          create: {
            description: `KluCoach student subscription (${sub.plan.name})`,
            studentCount: count,
            unitPricePaise: sub.studentUnitPricePaise,
            amountPaise: amount,
            periodStart: input.periodStart,
            periodEnd: input.periodEnd,
          },
        },
      },
      include: { lines: true },
    });
    if (input.req) await writeAudit(input.req, "billing.invoice.issue", "BillingInvoice", created.id);
    const admins = await prisma.user.findMany({
      where: { institutionId: input.institutionId, role: "INSTITUTION_ADMIN", status: "ACTIVE" },
    });
    for (const admin of admins) {
      await deliverNotification({
        institutionId: input.institutionId,
        userId: admin.id,
        email: admin.email,
        type: "INVOICE_ISSUED",
        title: `Invoice ${created.invoiceNumber} issued`,
        body: `Invoice ${created.invoiceNumber} is ready.`,
        href: "/billing",
        dedupeKey: `INVOICE_ISSUED:${created.id}:${admin.id}`,
      });
    }
    return created;
  } catch (err) {
    const code = err && typeof err === "object" && "code" in err ? String((err as { code: unknown }).code) : "";
    if (code === "P2002") {
      const again = await prisma.billingInvoice.findUnique({
        where: { institutionId_dedupeKey: { institutionId: input.institutionId, dedupeKey } },
        include: { lines: true },
      });
      if (again) return again;
    }
    throw err;
  }
}

export async function recordManualPayment(input: {
  institutionId: string;
  invoiceId: string;
  amountPaise: number;
  paymentDate: Date;
  dedupeKey: string;
  method?: string;
  req?: FastifyRequest;
}) {
  const invoice = await prisma.billingInvoice.findFirst({
    where: { id: input.invoiceId, institutionId: input.institutionId },
  });
  if (!invoice) return null;
  const existing = await prisma.billingPayment.findUnique({
    where: { institutionId_dedupeKey: { institutionId: input.institutionId, dedupeKey: input.dedupeKey } },
  });
  if (existing) return existing;
  try {
    const payment = await prisma.$transaction(async (tx) => {
      const row = await tx.billingPayment.create({
        data: {
          institutionId: input.institutionId,
          invoiceId: invoice.id,
          amountPaise: input.amountPaise,
          currency: invoice.currency,
          paymentDate: input.paymentDate,
          method: input.method ?? "MANUAL",
          status: "SUCCESS",
          provider: "MANUAL",
          dedupeKey: input.dedupeKey,
        },
      });
      const paidPaise = invoice.paidPaise + input.amountPaise;
      await tx.billingInvoice.update({
        where: { id: invoice.id },
        data: {
          paidPaise,
          status: invoiceStatusFromPaid(invoice.totalPaise, paidPaise, invoice.status) as "ISSUED" | "PARTIALLY_PAID" | "PAID",
        },
      });
      return row;
    });
    if (input.req) await writeAudit(input.req, "billing.payment.record", "BillingPayment", payment.id);
    return payment;
  } catch (err) {
    const code = err && typeof err === "object" && "code" in err ? String((err as { code: unknown }).code) : "";
    if (code === "P2002") {
      return prisma.billingPayment.findUnique({
        where: { institutionId_dedupeKey: { institutionId: input.institutionId, dedupeKey: input.dedupeKey } },
      });
    }
    throw err;
  }
}

export async function recordRefund(input: {
  invoiceId: string;
  paymentId: string;
  amountPaise: number;
  reason?: string;
  dedupeKey: string;
  req?: FastifyRequest;
}) {
  const payment = await prisma.billingPayment.findFirst({
    where: { id: input.paymentId, invoiceId: input.invoiceId, status: "SUCCESS" },
  });
  if (!payment) return null;
  const invoice = await prisma.billingInvoice.findUnique({ where: { id: input.invoiceId } });
  if (!invoice) return null;
  const existing = await prisma.billingRefund.findUnique({
    where: { paymentId_dedupeKey: { paymentId: payment.id, dedupeKey: input.dedupeKey } },
  });
  if (existing) return existing;
  const refund = await prisma.$transaction(async (tx) => {
    const row = await tx.billingRefund.create({
      data: {
        invoiceId: invoice.id,
        paymentId: payment.id,
        amountPaise: input.amountPaise,
        reason: input.reason,
        dedupeKey: input.dedupeKey,
      },
    });
    const paidPaise = Math.max(0, invoice.paidPaise - input.amountPaise);
    await tx.billingInvoice.update({
      where: { id: invoice.id },
      data: {
        paidPaise,
        status: paidPaise <= 0 ? "REFUNDED" : (invoiceStatusFromPaid(invoice.totalPaise, paidPaise, "ISSUED") as "ISSUED" | "PARTIALLY_PAID" | "PAID"),
      },
    });
    return row;
  });
  if (input.req) await writeAudit(input.req, "billing.refund.record", "BillingRefund", refund.id);
  return refund;
}

export async function partnerReport(asOf = new Date()) {
  const institutions = await prisma.institution.findMany({
    select: { id: true, name: true, displayName: true, billingMode: true },
    orderBy: { name: "asc" },
  });
  const rows = [];
  for (const inst of institutions) {
    const view = await subscriptionView(inst.id, asOf);
    const invoices = await prisma.billingInvoice.findMany({
      where: { institutionId: inst.id, status: { not: "VOID" } },
      select: { totalPaise: true, paidPaise: true, status: true },
    });
    const invoicedPaise = invoices.reduce((s, i) => s + i.totalPaise, 0);
    const paidPaise = invoices.reduce((s, i) => s + i.paidPaise, 0);
    rows.push({
      institutionId: inst.id,
      institution: inst.displayName ?? inst.name,
      billingMode: inst.billingMode,
      commercialMode: view?.subscription?.commercialMode ?? null,
      plan: view?.subscription?.planName ?? null,
      status: view?.subscription?.status ?? null,
      billableStudents: view?.billableStudents ?? 0,
      studentUnitPricePaise: view?.subscription?.studentUnitPricePaise ?? 0,
      grossPaise: view?.economics?.grossPaise ?? 0,
      klunexRealizationPaise: view?.economics?.klunexRealizationPaise ?? 0,
      partnerSharePaise: view?.economics?.partnerSharePaise ?? 0,
      periodEnd: view?.subscription?.endsAt ?? null,
      renewalDate: view?.subscription?.renewalDate ?? null,
      invoicedPaise,
      paidPaise,
      outstandingPaise: outstandingPaise(invoicedPaise, paidPaise),
    });
  }
  const totals = rows.reduce(
    (acc, r) => {
      acc.institutions += 1;
      acc.billableStudents += r.billableStudents;
      acc.grossPaise += r.grossPaise;
      acc.klunexRealizationPaise += r.klunexRealizationPaise;
      acc.partnerSharePaise += r.partnerSharePaise;
      acc.invoicedPaise += r.invoicedPaise;
      acc.paidPaise += r.paidPaise;
      acc.outstandingPaise += r.outstandingPaise;
      acc.activeSubscriptions += r.status === "ACTIVE" || r.status === "PAST_DUE" || r.status === "TRIAL" ? 1 : 0;
      acc.expiredSubscriptions += r.status === "EXPIRED" ? 1 : 0;
      acc.renewalsDue += r.renewalDate && r.renewalDate <= asOf.toISOString().slice(0, 10) ? 1 : 0;
      return acc;
    },
    {
      institutions: 0,
      activeSubscriptions: 0,
      expiredSubscriptions: 0,
      renewalsDue: 0,
      billableStudents: 0,
      grossPaise: 0,
      klunexRealizationPaise: 0,
      partnerSharePaise: 0,
      invoicedPaise: 0,
      paidPaise: 0,
      outstandingPaise: 0,
    },
  );
  return { asOf: asOf.toISOString(), totals, rows };
}

export { entitleStudent };
