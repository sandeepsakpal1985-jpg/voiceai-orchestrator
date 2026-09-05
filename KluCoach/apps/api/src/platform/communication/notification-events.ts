import { prisma } from "@klunex-edu/database";
import {
  deliverNotification,
  hrefForRole,
  parentsForStudent,
  studentRecipient,
} from "./notification-service.js";
import { scheduleStudentInsights } from "../insights/service.js";

function isoDate(value: Date | string) {
  const d = typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10);
  return d;
}

async function notifyFamily(opts: {
  institutionId: string;
  studentId: string;
  type: "ATTENDANCE_ABSENCE" | "ASSESSMENT_RESULT_PUBLISHED" | "ASSIGNMENT_CREATED" | "NOTICE_PUBLISHED" | "TIMETABLE_CHANGED";
  kind: "attendance" | "result" | "assignment" | "notice" | "timetable";
  parentTitle: string;
  parentBody: string;
  studentTitle: string;
  studentBody: string;
  dest?: "assignments" | "notices" | "timetable";
  includeStudent?: boolean;
  includeParents?: boolean;
  dedupeSuffix: string;
}) {
  const includeStudent = opts.includeStudent ?? true;
  const includeParents = opts.includeParents ?? true;
  if (includeParents) {
    const parents = await parentsForStudent(opts.institutionId, opts.studentId);
    for (const p of parents) {
      await deliverNotification({
        institutionId: opts.institutionId,
        userId: p.userId,
        email: p.email,
        studentId: p.studentId,
        type: opts.type,
        kind: opts.kind,
        title: opts.parentTitle,
        body: opts.parentBody,
        href: hrefForRole("PARENT", p.studentId, opts.dest),
        dedupeKey: `${opts.type}:${opts.dedupeSuffix}:${p.userId}:${p.studentId}`,
      });
    }
  }
  if (includeStudent) {
    const self = await studentRecipient(opts.institutionId, opts.studentId);
    if (self) {
      await deliverNotification({
        institutionId: opts.institutionId,
        userId: self.userId,
        email: self.email,
        studentId: self.studentId,
        type: opts.type,
        kind: opts.kind,
        title: opts.studentTitle,
        body: opts.studentBody,
        href: hrefForRole("STUDENT", self.studentId, opts.dest),
        dedupeKey: `${opts.type}:${opts.dedupeSuffix}:${self.userId}:${self.studentId}`,
      });
    }
  }
}

export async function onAttendanceMarked(
  institutionId: string,
  records: { studentId: string; status: string; date: Date | string; classSessionId?: string | null }[],
) {
  for (const rec of records) {
    if (rec.status !== "ABSENT") continue;
    const student = await prisma.student.findFirst({
      where: { id: rec.studentId, institutionId },
      select: { firstName: true },
    });
    if (!student) continue;
    const day = isoDate(rec.date);
    const session = rec.classSessionId ?? "none";
    await notifyFamily({
      institutionId,
      studentId: rec.studentId,
      type: "ATTENDANCE_ABSENCE",
      kind: "attendance",
      includeStudent: false,
      parentTitle: `${student.firstName} was marked absent on ${day}.`,
      parentBody: `${student.firstName} was marked absent on ${day}.`,
      studentTitle: "",
      studentBody: "",
      dedupeSuffix: `${institutionId}:${rec.studentId}:${day}:${session}`,
    });
  }
  const ids = [...new Set(records.map((r) => r.studentId))];
  if (ids.length) scheduleStudentInsights({ institutionId, studentIds: ids });
}

export async function onResultsPublished(
  institutionId: string,
  assessment: { id: string; name: string; subject?: { name: string } | null },
  studentIds: string[],
) {
  const subject = assessment.subject?.name ?? "Test";
  for (const studentId of studentIds) {
    const student = await prisma.student.findFirst({
      where: { id: studentId, institutionId },
      select: { firstName: true },
    });
    if (!student) continue;
    const title = `${subject} test result is available.`;
    await notifyFamily({
      institutionId,
      studentId,
      type: "ASSESSMENT_RESULT_PUBLISHED",
      kind: "result",
      parentTitle: `${student.firstName}'s ${subject} result is available.`,
      parentBody: `${student.firstName}'s ${subject} result is available.`,
      studentTitle: title,
      studentBody: title,
      dedupeSuffix: `${institutionId}:${assessment.id}:${studentId}`,
    });
  }
  if (studentIds.length) scheduleStudentInsights({ institutionId, studentIds });
}

export async function onAssignmentCreated(
  institutionId: string,
  assignment: { id: string; title: string; batchId: string },
) {
  const enrolls = await prisma.batchEnrollment.findMany({ where: { batchId: assignment.batchId } });
  for (const e of enrolls) {
    const student = await prisma.student.findFirst({
      where: { id: e.studentId, institutionId },
      select: { firstName: true },
    });
    if (!student) continue;
    await notifyFamily({
      institutionId,
      studentId: e.studentId,
      type: "ASSIGNMENT_CREATED",
      kind: "assignment",
      dest: "assignments",
      parentTitle: `New assignment: ${assignment.title}`,
      parentBody: `${student.firstName} has a new assignment: ${assignment.title}.`,
      studentTitle: `New assignment: ${assignment.title}`,
      studentBody: `New assignment: ${assignment.title}.`,
      dedupeSuffix: `${institutionId}:${assignment.id}`,
    });
  }
}

export async function onNoticePublished(
  institutionId: string,
  notice: { id: string; title: string; audience: string; branchId?: string | null; batchId?: string | null; studentIds?: string[] },
) {
  let studentIds: string[] = [];
  if (notice.audience === "STUDENTS") {
    studentIds = notice.studentIds ?? [];
  } else if (notice.audience === "BATCH" && notice.batchId) {
    const enrolls = await prisma.batchEnrollment.findMany({ where: { batchId: notice.batchId } });
    studentIds = enrolls.map((e) => e.studentId);
  } else if (notice.audience === "BRANCH" && notice.branchId) {
    const rows = await prisma.student.findMany({
      where: { institutionId, branchId: notice.branchId, archivedAt: null },
      select: { id: true },
    });
    studentIds = rows.map((s) => s.id);
  } else {
    const rows = await prisma.student.findMany({
      where: { institutionId, archivedAt: null },
      select: { id: true },
    });
    studentIds = rows.map((s) => s.id);
  }
  for (const studentId of studentIds) {
    const student = await prisma.student.findFirst({
      where: { id: studentId, institutionId },
      select: { firstName: true },
    });
    if (!student) continue;
    await notifyFamily({
      institutionId,
      studentId,
      type: "NOTICE_PUBLISHED",
      kind: "notice",
      dest: "notices",
      parentTitle: notice.title,
      parentBody: notice.title,
      studentTitle: notice.title,
      studentBody: notice.title,
      dedupeSuffix: `${institutionId}:${notice.id}`,
    });
  }
}

export async function onSessionChanged(
  institutionId: string,
  before: { batchId: string; date: Date; startMinute: number; endMinute: number; room: string | null; status: string; subjectId: string },
  after: { id: string; batchId: string; date: Date; startMinute: number; endMinute: number; room: string | null; status: string; subjectId: string },
) {
  const meaningful =
    before.date.getTime() !== after.date.getTime() ||
    before.startMinute !== after.startMinute ||
    before.endMinute !== after.endMinute ||
    before.room !== after.room ||
    before.status !== after.status ||
    before.batchId !== after.batchId;
  if (!meaningful) return;
  const subject = await prisma.subject.findFirst({ where: { id: after.subjectId } });
  const enrolls = await prisma.batchEnrollment.findMany({ where: { batchId: after.batchId } });
  const subjectName = subject?.name ?? "class";
  for (const e of enrolls) {
    const student = await prisma.student.findFirst({
      where: { id: e.studentId, institutionId },
      select: { firstName: true },
    });
    if (!student) continue;
    const cancelled = after.status === "CANCELLED";
    const parentBody = cancelled
      ? `${student.firstName}'s ${subjectName} class was cancelled.`
      : `Schedule changed for ${student.firstName}'s ${subjectName} class.`;
    await notifyFamily({
      institutionId,
      studentId: e.studentId,
      type: "TIMETABLE_CHANGED",
      kind: "timetable",
      dest: "timetable",
      parentTitle: parentBody,
      parentBody,
      studentTitle: cancelled ? `${subjectName} class was cancelled.` : `Schedule changed for ${subjectName}.`,
      studentBody: cancelled ? `${subjectName} class was cancelled.` : `Schedule changed for ${subjectName}.`,
      dedupeSuffix: `${institutionId}:${after.id}:${after.date.toISOString()}:${after.startMinute}:${after.room ?? ""}:${after.status}`,
    });
  }
}
