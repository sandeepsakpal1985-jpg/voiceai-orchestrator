import { prisma } from "@klunex-edu/database";
import { partnerReport } from "../billing/billing-service.js";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function latestIso(...dates: (Date | null | undefined)[]) {
  const stamps = dates.filter((d): d is Date => d instanceof Date).map((d) => d.getTime());
  if (stamps.length === 0) return null;
  return new Date(Math.max(...stamps)).toISOString();
}

export async function assemblePilotMetrics(asOf = new Date()) {
  const weekAgo = new Date(asOf.getTime() - WEEK_MS);
  const commercial = await partnerReport(asOf);
  const institutions = await prisma.institution.findMany({
    select: { id: true, name: true, displayName: true, billingMode: true },
    orderBy: { name: "asc" },
  });

  const rows = await Promise.all(
    institutions.map(async (inst) => {
      const institutionId = inst.id;
      const [
        activeStudents,
        activeTeachers,
        guardians,
        parentsActivated,
        invitationsCreated,
        invitationsAccepted,
        invitationsExpired,
        attendanceDays,
        assessments,
        assignments,
        notices,
        notificationsCreated,
        notificationsRead,
        weeklyParentReaders,
        movementEvents,
        accessGates,
        subscription,
        lastAttendance,
        lastNotification,
        lastMovement,
      ] = await Promise.all([
        prisma.student.count({ where: { institutionId, status: "ACTIVE" } }),
        prisma.teacher.count({ where: { institutionId } }),
        prisma.guardian.count({ where: { institutionId } }),
        prisma.guardian.count({ where: { institutionId, userId: { not: null } } }),
        prisma.invitation.count({ where: { institutionId, type: "PARENT" } }),
        prisma.invitation.count({ where: { institutionId, type: "PARENT", acceptedAt: { not: null } } }),
        prisma.invitation.count({
          where: { institutionId, type: "PARENT", acceptedAt: null, expiresAt: { lt: asOf } },
        }),
        prisma.attendanceRecord.groupBy({ by: ["date"], where: { institutionId } }).then((g) => g.length),
        prisma.assessment.count({ where: { institutionId } }),
        prisma.assignment.count({ where: { institutionId } }),
        prisma.notice.count({ where: { institutionId } }),
        prisma.notification.count({ where: { institutionId } }),
        prisma.notification.count({ where: { institutionId, readAt: { not: null } } }),
        prisma.notification.findMany({
          where: {
            institutionId,
            readAt: { gte: weekAgo },
            user: { role: "PARENT" },
          },
          distinct: ["userId"],
          select: { userId: true },
        }),
        prisma.movementEvent.count({ where: { institutionId, type: { in: ["ENTRY", "EXIT"] } } }),
        prisma.accessGate.count({ where: { institutionId } }),
        prisma.tenantSubscription.findUnique({
          where: { institutionId },
          select: { status: true, plan: { select: { code: true } } },
        }),
        prisma.attendanceRecord.findFirst({
          where: { institutionId },
          orderBy: { createdAt: "desc" },
          select: { createdAt: true },
        }),
        prisma.notification.findFirst({
          where: { institutionId },
          orderBy: { createdAt: "desc" },
          select: { createdAt: true },
        }),
        prisma.movementEvent.findFirst({
          where: { institutionId },
          orderBy: { occurredAt: "desc" },
          select: { occurredAt: true },
        }),
      ]);

      const commercialRow = commercial.rows.find((r) => r.institutionId === institutionId);
      return {
        institutionId,
        institution: inst.displayName ?? inst.name,
        billingMode: inst.billingMode,
        activeStudents,
        activeTeachers,
        activeParents: parentsActivated,
        parentLinks: guardians,
        parentActivationRate: guardians === 0 ? 0 : parentsActivated / guardians,
        invitationsCreated,
        invitationsAccepted,
        invitationsExpired,
        weeklyActiveParents: weeklyParentReaders.length,
        attendanceDays,
        assessmentsCreated: assessments,
        assignmentsCreated: assignments,
        noticesCreated: notices,
        notificationsDelivered: notificationsCreated,
        notificationsRead,
        safetrackEnabled: accessGates > 0,
        safetrackEvents: movementEvents,
        lastActivityAt: latestIso(lastAttendance?.createdAt, lastNotification?.createdAt, lastMovement?.occurredAt),
        subscriptionStatus: subscription?.status ?? null,
        planCode: subscription?.plan.code ?? null,
        billableStudents: commercialRow?.billableStudents ?? 0,
        grossPaise: commercialRow?.grossPaise ?? 0,
        klunexRealizationPaise: commercialRow?.klunexRealizationPaise ?? 0,
        partnerSharePaise: commercialRow?.partnerSharePaise ?? 0,
        outstandingPaise: commercialRow?.outstandingPaise ?? 0,
      };
    }),
  );

  return { asOf: asOf.toISOString(), totals: commercial.totals, rows };
}
