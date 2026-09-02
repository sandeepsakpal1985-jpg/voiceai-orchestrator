import { Prisma } from "@klunex-edu/database";
import { prisma } from "@klunex-edu/database";
import type { NotificationType } from "@klunex-edu/shared";
import { emailProvider } from "./notify.js";

const DEFAULTS = {
  attendanceAlerts: true,
  resultAlerts: true,
  assignmentAlerts: true,
  noticeAlerts: true,
  timetableAlerts: true,
  feeAlerts: false,
  channelInApp: true,
  channelEmail: true,
};

export type AlertKind = "attendance" | "result" | "assignment" | "notice" | "timetable" | "fee";

export async function loadPreferences(institutionId: string, userId: string) {
  const row = await prisma.notificationPreference.findUnique({ where: { userId } });
  if (!row || row.institutionId !== institutionId) return DEFAULTS;
  return {
    attendanceAlerts: row.attendanceAlerts,
    resultAlerts: row.resultAlerts,
    assignmentAlerts: row.assignmentAlerts,
    noticeAlerts: row.noticeAlerts,
    timetableAlerts: row.timetableAlerts,
    feeAlerts: row.feeAlerts,
    channelInApp: row.channelInApp,
    channelEmail: row.channelEmail,
  };
}

function allows(prefs: typeof DEFAULTS, kind: AlertKind) {
  if (kind === "attendance") return prefs.attendanceAlerts;
  if (kind === "result") return prefs.resultAlerts;
  if (kind === "assignment") return prefs.assignmentAlerts;
  if (kind === "notice") return prefs.noticeAlerts;
  if (kind === "timetable") return prefs.timetableAlerts;
  return prefs.feeAlerts;
}

export async function deliverNotification(input: {
  institutionId: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  href: string;
  dedupeKey: string;
  studentId?: string | null;
  email?: string | null;
  kind?: AlertKind;
  channels?: Array<"IN_APP" | "EMAIL">;
  payload?: Record<string, unknown>;
}) {
  const prefs = await loadPreferences(input.institutionId, input.userId);
  const kind = input.kind;
  if (kind && !allows(prefs, kind)) return { created: false };
  const channels = input.channels ?? ["IN_APP"];
  if (channels.includes("IN_APP") && prefs.channelInApp) {
    const existing = await prisma.notification.findUnique({
      where: {
        institutionId_userId_dedupeKey: {
          institutionId: input.institutionId,
          userId: input.userId,
          dedupeKey: input.dedupeKey,
        },
      },
    });
    if (existing) return { created: false };
    try {
      await prisma.notification.create({
        data: {
          institutionId: input.institutionId,
          userId: input.userId,
          studentId: input.studentId ?? null,
          channel: "IN_APP",
          type: input.type,
          title: input.title,
          body: input.body,
          href: input.href,
          dedupeKey: input.dedupeKey,
          payload: (input.payload ?? {}) as Prisma.InputJsonValue,
        },
      });
    } catch (err) {
      const code = err && typeof err === "object" && "code" in err ? String((err as { code: unknown }).code) : "";
      if (code === "P2002") return { created: false };
      throw err;
    }
  }
  if (channels.includes("EMAIL") && prefs.channelEmail && input.email) {
    await emailProvider.send({ to: input.email, title: input.title });
  }
  return { created: true };
}

export async function parentsForStudent(institutionId: string, studentId: string) {
  const links = await prisma.studentGuardian.findMany({
    where: { studentId, guardian: { institutionId, userId: { not: null } } },
    include: { guardian: { include: { user: true } }, student: true },
  });
  return links
    .filter((l) => l.guardian.user)
    .map((l) => ({
      userId: l.guardian.user!.id,
      email: l.guardian.user!.email ?? l.guardian.email,
      studentId: l.student.id,
      studentName: l.student.firstName,
      role: "PARENT" as const,
    }));
}

export async function studentRecipient(institutionId: string, studentId: string) {
  const student = await prisma.student.findFirst({
    where: { id: studentId, institutionId },
    include: { user: true },
  });
  if (!student?.userId || !student.user) return null;
  return {
    userId: student.user.id,
    email: student.user.email ?? student.email,
    studentId: student.id,
    studentName: student.firstName,
    role: "STUDENT" as const,
  };
}

export function parentHref(studentId: string) {
  return `/parent?studentId=${studentId}`;
}

export function studentHref() {
  return "/student";
}

export function hrefForRole(role: "PARENT" | "STUDENT", studentId: string, dest?: "assignments" | "notices" | "timetable") {
  if (dest === "assignments") return "/assignments";
  if (dest === "notices") return "/notices";
  if (dest === "timetable") return "/timetable";
  return role === "PARENT" ? parentHref(studentId) : studentHref();
}
