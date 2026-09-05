import { Prisma } from "@klunex-edu/database";
import { prisma } from "@klunex-edu/database";
import type { InsightType } from "@klunex-edu/shared";
import { writeSystemAudit } from "../audit/write.js";
import {
  deliverNotification,
  hrefForRole,
  parentsForStudent,
  studentRecipient,
} from "../communication/notification-service.js";
import { detectInstitutionInsights } from "./detect.js";
import type { DetectedInsight } from "./rules.js";
import { maybeEnhanceInsightWording } from "./wording.js";

function kindFor(type: InsightType): "attendance" | "result" | "assignment" {
  if (type.startsWith("ATTENDANCE")) return "attendance";
  if (type.startsWith("ACADEMIC")) return "result";
  return "assignment";
}

async function notifyInsight(
  institutionId: string,
  studentId: string,
  insight: { type: InsightType; title: string; summary: string; id: string },
) {
  const dest = insight.type === "ASSIGNMENT_OVERDUE" ? "assignments" : undefined;
  const parents = await parentsForStudent(institutionId, studentId);
  for (const p of parents) {
    await deliverNotification({
      institutionId,
      userId: p.userId,
      email: p.email,
      studentId,
      type: insight.type,
      kind: kindFor(insight.type),
      title: insight.title,
      body: insight.summary,
      href: hrefForRole("PARENT", studentId, dest),
      dedupeKey: `${insight.type}:${insight.id}:${p.userId}`,
      payload: { insightId: insight.id },
    });
  }
  const self = await studentRecipient(institutionId, studentId);
  if (self) {
    await deliverNotification({
      institutionId,
      userId: self.userId,
      email: self.email,
      studentId,
      type: insight.type,
      kind: kindFor(insight.type),
      title: insight.title,
      body: insight.summary,
      href: hrefForRole("STUDENT", studentId, dest),
      dedupeKey: `${insight.type}:${insight.id}:${self.userId}`,
      payload: { insightId: insight.id },
    });
  }
}

export async function persistInsight(
  institutionId: string,
  studentId: string,
  detected: DetectedInsight,
) {
  const existing = await prisma.studentInsight.findUnique({
    where: {
      institutionId_studentId_dedupeKey: {
        institutionId,
        studentId,
        dedupeKey: detected.dedupeKey,
      },
    },
  });
  if (existing) {
    await notifyInsight(institutionId, studentId, {
      type: existing.type as InsightType,
      title: existing.title,
      summary: existing.summary,
      id: existing.id,
    });
    return { created: false as const, insight: existing };
  }
  const wording = await maybeEnhanceInsightWording(detected);
  try {
    const insight = await prisma.studentInsight.create({
      data: {
        institutionId,
        studentId,
        type: detected.type,
        severity: detected.severity,
        title: wording.title,
        summary: wording.summary,
        source: detected.source as Prisma.InputJsonValue,
        dedupeKey: detected.dedupeKey,
      },
    });
    await notifyInsight(institutionId, studentId, {
      type: detected.type,
      title: insight.title,
      summary: insight.summary,
      id: insight.id,
    });
    await writeSystemAudit({
      action: "insight.detected",
      entityType: "StudentInsight",
      entityId: insight.id,
      institutionId,
      metadata: { type: detected.type, studentId },
    });
    await writeSystemAudit({
      action: "insight.notification.created",
      entityType: "StudentInsight",
      entityId: insight.id,
      institutionId,
      metadata: { type: detected.type },
    });
    await writeSystemAudit({
      action: "insight.notification.delivered",
      entityType: "StudentInsight",
      entityId: insight.id,
      institutionId,
      metadata: { channel: "IN_APP" },
    });
    return { created: true as const, insight };
  } catch (err) {
    const code = err && typeof err === "object" && "code" in err ? String((err as { code: unknown }).code) : "";
    if (code === "P2002") {
      const row = await prisma.studentInsight.findUnique({
        where: {
          institutionId_studentId_dedupeKey: { institutionId, studentId, dedupeKey: detected.dedupeKey },
        },
      });
      return { created: false as const, insight: row };
    }
    await writeSystemAudit({
      action: "insight.generation.failed",
      entityType: "StudentInsight",
      institutionId,
      metadata: { type: detected.type, studentId },
    });
    throw err;
  }
}

export async function runStudentInsights(opts?: { institutionId?: string; studentIds?: string[]; asOf?: Date }) {
  const asOf = opts?.asOf ?? new Date();
  const institutions = opts?.institutionId
    ? [{ id: opts.institutionId }]
    : await prisma.institution.findMany({ where: { status: "ACTIVE" }, select: { id: true } });
  let detected = 0;
  let created = 0;
  for (const inst of institutions) {
    const rows = await detectInstitutionInsights(inst.id, asOf, opts?.studentIds);
    for (const row of rows) {
      for (const insight of row.insights) {
        detected += 1;
        const result = await persistInsight(inst.id, row.studentId, insight);
        if (result.created) created += 1;
      }
    }
  }
  return { institutions: institutions.length, detected, created };
}

/** Domain writes must not wait on insight detection. Failures are audited, not thrown to the client. */
export function scheduleStudentInsights(opts?: { institutionId?: string; studentIds?: string[]; asOf?: Date }) {
  void runStudentInsights(opts).catch(async () => {
    await writeSystemAudit({
      action: "insight.generation.failed",
      entityType: "StudentInsight",
      institutionId: opts?.institutionId,
      metadata: { scheduled: true },
    });
  });
}
