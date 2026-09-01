import { prisma } from "@klunex-edu/database";
import { student360Schema, type Student360 } from "@klunex-edu/shared";
import { notFound } from "../../lib/errors.js";
import { decideStudent360Status, trendFromRates, STUDENT_360_THRESHOLDS } from "./student360-status.js";

function pct(part: number, total: number) {
  if (!total) return null;
  return Math.round((part / total) * 1000) / 10;
}

function isoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function presentish(status: string) {
  return status === "PRESENT" || status === "LATE";
}

export async function assembleStudent360(institutionId: string, studentId: string): Promise<Student360> {
  const student = await prisma.student.findFirst({
    where: { id: studentId, institutionId },
    include: {
      branch: true,
      academicYear: true,
      enrollments: { include: { batch: { include: { program: true } } } },
    },
  });
  if (!student) throw notFound();

  const enrollBatchIds = student.enrollments.map((e) => e.batchId);
  const primary = student.enrollments[0]?.batch ?? null;
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const dueSoon = new Date(today);
  dueSoon.setUTCDate(dueSoon.getUTCDate() + 7);

  const [attendance, results, submissions, upcoming, notices, invoice] = await Promise.all([
    prisma.attendanceRecord.findMany({
      where: { institutionId, studentId },
      orderBy: { date: "desc" },
      take: 90,
    }),
    prisma.assessmentResult.findMany({
      where: { institutionId, studentId },
      include: { assessment: { include: { subject: true } } },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.assignmentSubmission.findMany({
      where: { studentId, assignment: { institutionId } },
      include: { assignment: { include: { subject: true } } },
      orderBy: { assignment: { dueAt: "asc" } },
      take: 30,
    }),
    enrollBatchIds.length === 0
      ? Promise.resolve([])
      : prisma.classSession.findMany({
          where: { institutionId, batchId: { in: enrollBatchIds }, date: { gte: today }, status: "SCHEDULED" },
          include: { subject: true, teacher: true },
          orderBy: [{ date: "asc" }, { startMinute: "asc" }],
          take: 6,
        }),
    prisma.notice.findMany({
      where: {
        institutionId,
        OR: [
          { audience: "INSTITUTION" },
          ...(enrollBatchIds.length ? [{ batchId: { in: enrollBatchIds } }] : []),
          { students: { some: { studentId } } },
        ],
      },
      orderBy: { publishedAt: "desc" },
      take: 5,
    }),
    prisma.feeInvoice.findFirst({
      where: { institutionId, studentId },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const present = attendance.filter((a) => a.status === "PRESENT").length;
  const absent = attendance.filter((a) => a.status === "ABSENT").length;
  const late = attendance.filter((a) => a.status === "LATE").length;
  const excused = attendance.filter((a) => a.status === "EXCUSED").length;
  const attendancePercent = pct(present + late, attendance.length);
  const chronological = [...attendance].sort((a, b) => a.date.getTime() - b.date.getTime());
  const midAtt = Math.floor(chronological.length / 2);
  const olderAtt = chronological.slice(0, midAtt);
  const newerAtt = chronological.slice(midAtt);
  const attendanceTrend = trendFromRates(
    pct(olderAtt.filter((a) => presentish(a.status)).length, olderAtt.length),
    pct(newerAtt.filter((a) => presentish(a.status)).length, newerAtt.length),
    STUDENT_360_THRESHOLDS.minAttendanceForTrend,
    olderAtt.length,
    newerAtt.length,
  );

  const avg =
    results.length === 0
      ? null
      : Math.round((results.reduce((sum, r) => sum + Number(r.percentage), 0) / results.length) * 10) / 10;
  const byDate = [...results].sort(
    (a, b) => a.assessment.date.getTime() - b.assessment.date.getTime() || a.createdAt.getTime() - b.createdAt.getTime(),
  );
  const midRes = Math.floor(byDate.length / 2);
  const olderRes = byDate.slice(0, midRes);
  const newerRes = byDate.slice(midRes);
  const academicTrend = trendFromRates(
    olderRes.length ? olderRes.reduce((s, r) => s + Number(r.percentage), 0) / olderRes.length : null,
    newerRes.length ? newerRes.reduce((s, r) => s + Number(r.percentage), 0) / newerRes.length : null,
    STUDENT_360_THRESHOLDS.minResultsForTrend,
    olderRes.length,
    newerRes.length,
  );
  const subjectMap = new Map<string, { total: number; count: number }>();
  for (const row of results) {
    const name = row.assessment.subject.name;
    const cur = subjectMap.get(name) ?? { total: 0, count: 0 };
    cur.total += Number(row.percentage);
    cur.count += 1;
    subjectMap.set(name, cur);
  }

  const overdue = submissions.filter((s) => s.status !== "SUBMITTED" && s.status !== "REVIEWED" && s.assignment.dueAt < today).length;
  const pending = submissions.filter((s) => s.status === "PENDING" || s.status === "LATE").length;
  const dueSoonCount = submissions.filter(
    (s) => (s.status === "PENDING" || s.status === "LATE") && s.assignment.dueAt >= today && s.assignment.dueAt <= dueSoon,
  ).length;
  const submitted = submissions.filter((s) => s.status === "SUBMITTED" || s.status === "REVIEWED").length;

  const summary = decideStudent360Status({
    attendanceCount: attendance.length,
    attendancePercent,
    resultCount: results.length,
    academicAverage: avg,
    overdue,
    academicTrend,
  });

  const dto: Student360 = {
    student: {
      id: student.id,
      firstName: student.firstName,
      lastName: student.lastName,
      preferredName: student.preferredName,
      admissionNumber: student.admissionNumber,
      status: student.status,
      photoUrl: null,
      batch: primary?.name ?? null,
      program: primary?.program.name ?? null,
      branch: student.branch.name,
      academicYear: student.academicYear?.name ?? null,
    },
    summary,
    overall: summary.statusLabel,
    attendance: {
      percent: attendancePercent,
      present,
      absent,
      late,
      excused,
      recent: [...attendance]
        .sort((a, b) => b.date.getTime() - a.date.getTime())
        .slice(0, 8)
        .map((a) => ({ date: isoDate(a.date), status: a.status })),
      periodLabel: attendance.length ? "Recorded sessions" : "No period yet",
      trend: attendanceTrend,
    },
    academic: {
      average: avg,
      latest: results.slice(0, 8).map((r) => ({
        percentage: Number(r.percentage),
        marks: Number(r.marks),
        maxMarks: r.assessment.maxMarks != null ? Number(r.assessment.maxMarks) : null,
        assessment: { name: r.assessment.name, subject: { name: r.assessment.subject.name } },
      })),
      bySubject: [...subjectMap.entries()].map(([subject, v]) => ({
        subject,
        average: Math.round((v.total / v.count) * 10) / 10,
        count: v.count,
      })),
      trend: academicTrend,
    },
    upcoming: upcoming.map((u) => ({
      id: u.id,
      date: isoDate(u.date),
      startMinute: u.startMinute,
      endMinute: u.endMinute,
      room: u.room,
      subject: { name: u.subject.name },
      teacher: u.teacher ? { name: u.teacher.name } : null,
    })),
    assignments: {
      pending,
      overdue,
      dueSoon: dueSoonCount,
      submitted,
      items: submissions.slice(0, 8).map((s) => ({
        id: s.assignment.id,
        title: s.assignment.title,
        dueAt: s.assignment.dueAt.toISOString(),
        status: s.status,
        subject: s.assignment.subject.name,
      })),
    },
    notices: notices.map((n) => ({ id: n.id, title: n.title, publishedAt: n.publishedAt.toISOString() })),
    fees: invoice
      ? {
          status: invoice.status,
          pendingPaise: invoice.totalPaise - invoice.paidPaise,
          dueDate: invoice.dueDate ? isoDate(invoice.dueDate) : null,
        }
      : null,
    metadata: { generatedAt: new Date().toISOString() },
  };
  return student360Schema.parse(dto);
}
