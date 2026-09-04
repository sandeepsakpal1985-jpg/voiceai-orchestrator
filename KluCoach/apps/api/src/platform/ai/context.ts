import { prisma } from "@klunex-edu/database";
import { AI_CONTEXT_VERSIONS, type Student360 } from "@klunex-edu/shared";
import { assembleStudent360 } from "../students/student360.js";
import { notFound } from "../../lib/errors.js";

export type AiCitation = { type: string; label: string; value: string };

export type StudentAiContext = {
  student: { name: string; batch: string | null; program: string | null };
  status: string;
  attendance: { percentage: number | null; recentAbsences: number; trend: string };
  academics: {
    averagePercentage: number | null;
    recentResults: { subject: string; name: string; marks: string }[];
    strongestSubject: string | null;
    trend: string;
  };
  assignments: { pending: number; overdue: number; titles: string[] };
  timetable: { upcoming: { date: string; subject: string }[] };
  notices: string[];
  fees: { label: string; pendingPaise: number } | null;
};

const MAX_BATCH_STUDENTS = 40;

export function buildStudent360AiContext(snapshot: Student360): StudentAiContext {
  const name = snapshot.student.preferredName || snapshot.student.firstName;
  const bySubject = [...snapshot.academic.bySubject].sort((a, b) => b.average - a.average);
  const recentAbsences = snapshot.attendance.recent.filter((r) => r.status === "ABSENT").length;
  return {
    student: {
      name,
      batch: snapshot.student.batch,
      program: snapshot.student.program,
    },
    status: snapshot.summary.statusLabel,
    attendance: {
      percentage: snapshot.attendance.percent,
      recentAbsences,
      trend: snapshot.attendance.trend,
    },
    academics: {
      averagePercentage: snapshot.academic.average,
      recentResults: snapshot.academic.latest.slice(0, 5).map((r) => ({
        subject: r.assessment.subject.name,
        name: r.assessment.name,
        marks: r.maxMarks != null ? `${r.marks}/${r.maxMarks}` : `${r.percentage}%`,
      })),
      strongestSubject: bySubject[0]?.subject ?? null,
      trend: snapshot.academic.trend,
    },
    assignments: {
      pending: snapshot.assignments.pending,
      overdue: snapshot.assignments.overdue,
      titles: snapshot.assignments.items.filter((i) => i.status === "PENDING" || i.status === "LATE").map((i) => i.title),
    },
    timetable: {
      upcoming: snapshot.upcoming.slice(0, 4).map((u) => ({ date: u.date, subject: u.subject.name })),
    },
    notices: snapshot.notices.map((n) => n.title),
    fees: snapshot.fees ? { label: snapshot.fees.label, pendingPaise: snapshot.fees.pendingPaise } : null,
  };
}

export function citationsFromStudentContext(ctx: StudentAiContext): AiCitation[] {
  const rows: AiCitation[] = [];
  if (ctx.attendance.percentage != null) {
    rows.push({ type: "attendance", label: "Attendance", value: `${ctx.attendance.percentage}%` });
  }
  if (ctx.academics.averagePercentage != null) {
    rows.push({ type: "assessment", label: "Recent average", value: `${ctx.academics.averagePercentage}%` });
  }
  const latest = ctx.academics.recentResults[0];
  if (latest) {
    rows.push({ type: "assessment", label: `Latest ${latest.subject} test`, value: latest.marks });
  }
  rows.push({ type: "assignment", label: "Pending assignments", value: String(ctx.assignments.pending) });
  if (ctx.fees) {
    rows.push({ type: "fee", label: "Fee status", value: ctx.fees.label });
  }
  return rows;
}

export async function studentContextForAuthorizedId(institutionId: string, studentId: string) {
  const snapshot = await assembleStudent360(institutionId, studentId);
  const context = buildStudent360AiContext(snapshot);
  return { context, citations: citationsFromStudentContext(context), contextVersion: AI_CONTEXT_VERSIONS.student };
}

function attendancePercent(present: number, late: number, total: number) {
  if (!total) return null;
  return Math.round(((present + late) / total) * 1000) / 10;
}

export async function buildAuthorizedBatchContext(institutionId: string, batchId: string) {
  const batch = await prisma.batch.findFirst({
    where: { id: batchId, institutionId },
    select: { id: true, name: true },
  });
  if (!batch) throw notFound();
  const enrolls = await prisma.batchEnrollment.findMany({
    where: { batchId, status: "ACTIVE" },
    take: MAX_BATCH_STUDENTS,
    include: { student: { select: { id: true, firstName: true, lastName: true, status: true } } },
  });
  const studentIds = enrolls.map((e) => e.studentId);
  const [attendance, pendingSubs] = await Promise.all([
    studentIds.length
      ? prisma.attendanceRecord.groupBy({
          by: ["studentId", "status"],
          where: { institutionId, studentId: { in: studentIds } },
          _count: { _all: true },
        })
      : Promise.resolve([]),
    studentIds.length
      ? prisma.assignmentSubmission.count({
          where: { studentId: { in: studentIds }, status: { in: ["PENDING", "LATE"] }, assignment: { institutionId, batchId } },
        })
      : Promise.resolve(0),
  ]);
  const totals = new Map<string, { present: number; late: number; total: number }>();
  for (const row of attendance) {
    const cur = totals.get(row.studentId) ?? { present: 0, late: 0, total: 0 };
    cur.total += row._count._all;
    if (row.status === "PRESENT") cur.present += row._count._all;
    if (row.status === "LATE") cur.late += row._count._all;
    totals.set(row.studentId, cur);
  }
  const students = enrolls.map((e) => {
    const t = totals.get(e.studentId);
    const percentage = t ? attendancePercent(t.present, t.late, t.total) : null;
    return {
      name: e.student.firstName,
      status: e.student.status,
      attendancePercent: percentage,
    };
  });
  const lowAttendance = students.filter((s) => s.attendancePercent != null && s.attendancePercent < 75);
  const context = {
    batch: {
      name: batch.name,
      studentCount: students.length,
      pendingAssignments: pendingSubs,
      lowAttendanceCount: lowAttendance.length,
    },
    students: students.map((s) => ({
      name: s.name,
      attendancePercent: s.attendancePercent,
    })),
    needsAttention: lowAttendance.map((s) => s.name),
  };
  const citations: AiCitation[] = [
    { type: "batch", label: "Batch", value: batch.name },
    { type: "batch", label: "Authorized students", value: String(students.length) },
    { type: "assignment", label: "Pending assignments", value: String(pendingSubs) },
    { type: "attendance", label: "Attendance below 75%", value: String(lowAttendance.length) },
  ];
  return { context, citations, contextVersion: AI_CONTEXT_VERSIONS.batch };
}

export async function buildAuthorizedInstitutionContext(institutionId: string) {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const since = new Date(today);
  since.setUTCDate(since.getUTCDate() - 30);
  const [activeStudents, batches, pendingAssignments, attendance] = await Promise.all([
    prisma.student.count({ where: { institutionId, status: "ACTIVE", archivedAt: null } }),
    prisma.batch.findMany({
      where: { institutionId, status: "ACTIVE" },
      select: { id: true, name: true, _count: { select: { enrollments: true } } },
      take: 30,
    }),
    prisma.assignmentSubmission.count({
      where: { status: { in: ["PENDING", "LATE"] }, assignment: { institutionId } },
    }),
    prisma.attendanceRecord.groupBy({
      by: ["status"],
      where: { institutionId, date: { gte: since } },
      _count: { _all: true },
    }),
  ]);
  const attTotal = attendance.reduce((s, r) => s + r._count._all, 0);
  const attPresent = attendance.filter((r) => r.status === "PRESENT" || r.status === "LATE").reduce((s, r) => s + r._count._all, 0);
  const overallAttendance = attendancePercent(attPresent, 0, attTotal);
  const context = {
    institution: {
      activeStudents,
      batchCount: batches.length,
      pendingAssignments,
      attendancePercent30d: overallAttendance,
    },
    batches: batches.map((b) => ({ name: b.name, enrollments: b._count.enrollments })),
  };
  const citations: AiCitation[] = [
    { type: "institution", label: "Active students", value: String(activeStudents) },
    { type: "institution", label: "Batches", value: String(batches.length) },
    { type: "assignment", label: "Pending assignments", value: String(pendingAssignments) },
  ];
  if (overallAttendance != null) {
    citations.push({ type: "attendance", label: "Attendance (30 days)", value: `${overallAttendance}%` });
  }
  return { context, citations, contextVersion: AI_CONTEXT_VERSIONS.institution };
}
