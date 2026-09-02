import { prisma } from "@klunex-edu/database";
import type { StudentStatus } from "@klunex-edu/database";

export const NON_BILLABLE_MODES = new Set(["DEMO", "NON_BILLABLE"]);

export async function loadBillingConfig() {
  const row = await prisma.platformBillingConfig.findUnique({ where: { id: "platform" } });
  return {
    currency: row?.currency ?? "INR",
    billingPeriod: row?.billingPeriod ?? "ANNUAL",
    gracePeriodDays: row?.gracePeriodDays ?? 7,
    billableStudentStatuses: (row?.billableStudentStatuses?.length ? row.billableStudentStatuses : ["ACTIVE"]) as StudentStatus[],
  };
}

export function isNonBillableMode(billingMode: string) {
  return NON_BILLABLE_MODES.has(billingMode);
}

export function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

export function resolveSubscriptionStatus(input: {
  stored: string;
  endsAt: Date | null;
  gracePeriodDays: number;
  asOf: Date;
}) {
  if (input.stored === "CANCELLED" || input.stored === "SUSPENDED" || input.stored === "TRIAL") {
    return input.stored;
  }
  if (!input.endsAt || input.asOf.getTime() <= input.endsAt.getTime()) return "ACTIVE";
  if (input.asOf.getTime() <= addDays(input.endsAt, input.gracePeriodDays).getTime()) return "PAST_DUE";
  return "EXPIRED";
}

export function resolveEntitlementStatus(input: {
  stored: string;
  endsAt: Date | null;
  gracePeriodDays: number;
  asOf: Date;
}) {
  if (input.stored === "CANCELLED") return "CANCELLED";
  if (!input.endsAt || input.asOf.getTime() <= input.endsAt.getTime()) return "ACTIVE";
  if (input.asOf.getTime() <= addDays(input.endsAt, input.gracePeriodDays).getTime()) return "GRACE";
  return "EXPIRED";
}

export async function hasActiveStudentEntitlement(studentId: string, asOf = new Date()) {
  const student = await prisma.student.findFirst({
    where: { id: studentId },
    include: { institution: { select: { billingMode: true } } },
  });
  if (!student) return false;
  if (isNonBillableMode(student.institution.billingMode)) return true;
  const cfg = await loadBillingConfig();
  const row = await prisma.studentEntitlement.findFirst({
    where: { studentId, institutionId: student.institutionId },
    include: { subscription: true },
    orderBy: { createdAt: "desc" },
  });
  if (!row) return false;
  const status = resolveEntitlementStatus({
    stored: row.status,
    endsAt: row.endsAt ?? row.subscription.endsAt,
    gracePeriodDays: row.subscription.gracePeriodDays || cfg.gracePeriodDays,
    asOf,
  });
  return status === "ACTIVE" || status === "GRACE";
}

export async function getEntitlementStatus(studentId: string, asOf = new Date()) {
  const student = await prisma.student.findFirst({
    where: { id: studentId },
    include: { institution: { select: { billingMode: true, id: true } } },
  });
  if (!student) return { status: "MISSING" as const, entitled: false, access: "none" as const, billingMode: "LIVE" };
  if (isNonBillableMode(student.institution.billingMode)) {
    return { status: "ACTIVE" as const, entitled: true, access: "non_billable" as const, billingMode: student.institution.billingMode };
  }
  const entitled = await hasActiveStudentEntitlement(studentId, asOf);
  const cfg = await loadBillingConfig();
  const row = await prisma.studentEntitlement.findFirst({
    where: { studentId, institutionId: student.institutionId },
    include: { subscription: true },
    orderBy: { createdAt: "desc" },
  });
  const status = row
    ? resolveEntitlementStatus({
        stored: row.status,
        endsAt: row.endsAt ?? row.subscription.endsAt,
        gracePeriodDays: row.subscription.gracePeriodDays || cfg.gracePeriodDays,
        asOf,
      })
    : "MISSING";
  return {
    status,
    entitled,
    access: entitled ? (status === "GRACE" ? "grace" : "full") : "expired",
    billingMode: student.institution.billingMode,
  };
}

export async function hasFeatureEntitlement(studentId: string, _feature: string, asOf = new Date()) {
  return hasActiveStudentEntitlement(studentId, asOf);
}

export async function entitleStudent(institutionId: string, studentId: string) {
  const sub = await prisma.tenantSubscription.findUnique({ where: { institutionId } });
  if (!sub) return { created: false };
  try {
    await prisma.studentEntitlement.create({
      data: {
        institutionId,
        studentId,
        subscriptionId: sub.id,
        startsAt: sub.startsAt,
        endsAt: sub.endsAt,
        unitPricePaise: sub.studentUnitPricePaise,
        status: "ACTIVE",
      },
    });
    return { created: true };
  } catch (err) {
    const code = err && typeof err === "object" && "code" in err ? String((err as { code: unknown }).code) : "";
    if (code === "P2002") return { created: false };
    throw err;
  }
}

export async function countBillableStudents(institutionId: string, asOf = new Date()) {
  const cfg = await loadBillingConfig();
  const sub = await prisma.tenantSubscription.findUnique({ where: { institutionId } });
  if (!sub) return 0;
  const graceEndFloor = new Date(asOf.getTime() - (sub.gracePeriodDays || cfg.gracePeriodDays) * 24 * 60 * 60 * 1000);
  return prisma.studentEntitlement.count({
    where: {
      institutionId,
      subscriptionId: sub.id,
      status: { not: "CANCELLED" },
      student: { archivedAt: null, status: { in: cfg.billableStudentStatuses } },
      OR: [{ endsAt: null }, { endsAt: { gte: graceEndFloor } }],
    },
  });
}
