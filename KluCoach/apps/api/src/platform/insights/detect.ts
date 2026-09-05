import { prisma } from "@klunex-edu/database";
import { config } from "../../config.js";
import {
  academicInsight,
  assignmentOverdueInsight,
  attendanceInsight,
  attendancePercent,
  average,
  inWindow,
  isoDate,
  periodWindows,
  type DetectedInsight,
} from "./rules.js";

export type InsightThresholds = {
  attendanceChangePercent: number;
  academicChangePercent: number;
  periodDays: number;
  minAttendanceSamples: number;
  minResultSamples: number;
};

export function insightThresholds(): InsightThresholds {
  return {
    attendanceChangePercent: config.insightAttendanceChangePercent,
    academicChangePercent: config.insightAcademicChangePercent,
    periodDays: config.insightPeriodDays,
    minAttendanceSamples: config.insightMinAttendanceSamples,
    minResultSamples: config.insightMinResultSamples,
  };
}

export function detectForStudent(input: {
  studentId: string;
  attendance: { date: Date; status: string }[];
  results: { date: Date; percentage: number }[];
  overdue: { assignmentId: string; title: string; subject: string; dueAt: Date }[];
  asOf: Date;
  thresholds: InsightThresholds;
}): DetectedInsight[] {
  const windows = periodWindows(input.asOf, input.thresholds.periodDays);
  const prevAtt = input.attendance.filter((r) => inWindow(r.date, windows.previousStart, windows.currentStart));
  const curAtt = input.attendance.filter((r) => inWindow(r.date, windows.currentStart, windows.end));
  const prevPct = attendancePercent(prevAtt);
  const curPct = attendancePercent(curAtt);
  const found: DetectedInsight[] = [];
  if (prevPct != null && curPct != null) {
    const att = attendanceInsight({
      previous: prevPct,
      current: curPct,
      previousCount: prevAtt.length,
      currentCount: curAtt.length,
      minSamples: input.thresholds.minAttendanceSamples,
      threshold: input.thresholds.attendanceChangePercent,
      periodKey: windows.periodKey,
    });
    if (att) found.push(att);
  }
  const prevRes = input.results.filter((r) => inWindow(r.date, windows.previousStart, windows.currentStart));
  const curRes = input.results.filter((r) => inWindow(r.date, windows.currentStart, windows.end));
  const prevAvg = average(prevRes.map((r) => r.percentage));
  const curAvg = average(curRes.map((r) => r.percentage));
  if (prevAvg != null && curAvg != null) {
    const aca = academicInsight({
      previous: prevAvg,
      current: curAvg,
      previousCount: prevRes.length,
      currentCount: curRes.length,
      minSamples: input.thresholds.minResultSamples,
      threshold: input.thresholds.academicChangePercent,
      periodKey: windows.periodKey,
    });
    if (aca) found.push(aca);
  }
  for (const row of input.overdue) {
    found.push(
      assignmentOverdueInsight({
        assignmentId: row.assignmentId,
        title: row.title,
        subject: row.subject,
        dueDate: isoDate(row.dueAt),
      }),
    );
  }
  return found;
}

export async function detectInstitutionInsights(institutionId: string, asOf = new Date(), studentIds?: string[]) {
  const thresholds = insightThresholds();
  const windows = periodWindows(asOf, thresholds.periodDays);
  const students = await prisma.student.findMany({
    where: {
      institutionId,
      status: "ACTIVE",
      archivedAt: null,
      ...(studentIds ? { id: { in: studentIds } } : {}),
    },
    select: { id: true },
  });
  const ids = students.map((s) => s.id);
  if (!ids.length) return [] as { studentId: string; insights: DetectedInsight[] }[];
  const [attendance, results, overdue] = await Promise.all([
    prisma.attendanceRecord.findMany({
      where: { institutionId, studentId: { in: ids }, date: { gte: windows.previousStart, lt: windows.end } },
      select: { studentId: true, date: true, status: true },
    }),
    prisma.assessmentResult.findMany({
      where: {
        institutionId,
        studentId: { in: ids },
        assessment: { date: { gte: windows.previousStart, lt: windows.end }, status: "PUBLISHED" },
      },
      select: { studentId: true, percentage: true, assessment: { select: { date: true } } },
    }),
    prisma.assignmentSubmission.findMany({
      where: {
        studentId: { in: ids },
        status: { notIn: ["SUBMITTED", "REVIEWED"] },
        assignment: { institutionId, dueAt: { lt: asOf } },
      },
      select: {
        studentId: true,
        assignmentId: true,
        assignment: { select: { title: true, dueAt: true, subject: { select: { name: true } } } },
      },
    }),
  ]);
  const attBy = new Map<string, { date: Date; status: string }[]>();
  for (const row of attendance) {
    const list = attBy.get(row.studentId) ?? [];
    list.push({ date: row.date, status: row.status });
    attBy.set(row.studentId, list);
  }
  const resBy = new Map<string, { date: Date; percentage: number }[]>();
  for (const row of results) {
    const list = resBy.get(row.studentId) ?? [];
    list.push({ date: row.assessment.date, percentage: Number(row.percentage) });
    resBy.set(row.studentId, list);
  }
  const overBy = new Map<string, { assignmentId: string; title: string; subject: string; dueAt: Date }[]>();
  for (const row of overdue) {
    const list = overBy.get(row.studentId) ?? [];
    list.push({
      assignmentId: row.assignmentId,
      title: row.assignment.title,
      subject: row.assignment.subject.name,
      dueAt: row.assignment.dueAt,
    });
    overBy.set(row.studentId, list);
  }
  return ids.map((studentId) => ({
    studentId,
    insights: detectForStudent({
      studentId,
      attendance: attBy.get(studentId) ?? [],
      results: resBy.get(studentId) ?? [],
      overdue: overBy.get(studentId) ?? [],
      asOf,
      thresholds,
    }),
  }));
}
