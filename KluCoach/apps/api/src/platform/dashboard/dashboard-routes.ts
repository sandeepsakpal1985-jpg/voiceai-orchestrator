import type { FastifyInstance } from "fastify";
import { prisma } from "@klunex-edu/database";
import { notFound } from "../../lib/errors.js";
import { requirePermission, requireTenant } from "../identity/http-auth.js";
import { parentStudentIds, studentSelfId } from "../identity/scope.js";

function pct(present: number, total: number) {
  if (!total) return null;
  return Math.round((present / total) * 1000) / 10;
}

async function student360(institutionId: string, studentId: string) {
  const student = await prisma.student.findFirst({
    where: { id: studentId, institutionId },
    include: { enrollments: { include: { batch: true } }, branch: true },
  });
  if (!student) throw notFound();
  const attendance = await prisma.attendanceRecord.findMany({
    where: { institutionId, studentId },
  });
  const presentish = attendance.filter((a) => a.status === "PRESENT" || a.status === "LATE").length;
  const results = await prisma.assessmentResult.findMany({
    where: { institutionId, studentId },
    include: { assessment: { include: { subject: true } } },
    orderBy: { createdAt: "desc" },
    take: 8,
  });
  const avg =
    results.length === 0
      ? null
      : Math.round((results.reduce((s, r) => s + Number(r.percentage), 0) / results.length) * 10) / 10;
  const pending = await prisma.assignmentSubmission.count({
    where: { studentId, status: { in: ["PENDING", "LATE"] } },
  });
  const notices = await prisma.notice.findMany({
    where: { institutionId },
    orderBy: { publishedAt: "desc" },
    take: 5,
  });
  const enrollBatchIds = student.enrollments.map((e) => e.batchId);
  const upcoming =
    enrollBatchIds.length === 0
      ? []
      : await prisma.classSession.findMany({
          where: { institutionId, batchId: { in: enrollBatchIds }, date: { gte: new Date() }, status: "SCHEDULED" },
          include: { subject: true },
          orderBy: { date: "asc" },
          take: 5,
        });
  const nextTest =
    enrollBatchIds.length === 0
      ? null
      : await prisma.assessment.findFirst({
          where: { institutionId, batchId: { in: enrollBatchIds }, date: { gte: new Date() } },
          include: { subject: true },
          orderBy: { date: "asc" },
        });
  const invoice = await prisma.feeInvoice.findFirst({
    where: { institutionId, studentId },
    orderBy: { createdAt: "desc" },
  });
  const attendancePct = pct(presentish, attendance.length);
  const overall =
    attendancePct != null && attendancePct >= 85 && (avg == null || avg >= 70)
      ? "Doing Well"
      : attendancePct != null && attendancePct < 75
        ? "Needs Attention"
        : "On Track";
  return {
    student: {
      id: student.id,
      firstName: student.firstName,
      lastName: student.lastName,
      preferredName: student.preferredName,
      admissionNumber: student.admissionNumber,
      status: student.status,
      branch: student.branch.name,
    },
    overall,
    attendance: {
      percent: attendancePct,
      present: attendance.filter((a) => a.status === "PRESENT").length,
      absent: attendance.filter((a) => a.status === "ABSENT").length,
      late: attendance.filter((a) => a.status === "LATE").length,
      excused: attendance.filter((a) => a.status === "EXCUSED").length,
      recent: [...attendance]
        .sort((a, b) => b.date.getTime() - a.date.getTime())
        .slice(0, 8)
        .map((a) => ({
          date: a.date.toISOString().slice(0, 10),
          status: a.status,
        })),
    },
    academic: {
      average: avg,
      latest: results.map((r) => ({
        percentage: Number(r.percentage),
        marks: Number(r.marks),
        assessment: { name: r.assessment.name, subject: { name: r.assessment.subject.name } },
      })),
    },
    assignments: { pending },
    upcoming: upcoming.map((u) => ({
      id: u.id,
      date: u.date.toISOString(),
      subject: { name: u.subject.name },
    })),
    nextTest: nextTest
      ? { name: nextTest.name, date: nextTest.date.toISOString(), subject: { name: nextTest.subject.name } }
      : null,
    notices: notices.map((n) => ({ id: n.id, title: n.title, body: n.body })),
    fees: invoice
      ? {
          total: invoice.totalPaise,
          paid: invoice.paidPaise,
          pending: invoice.totalPaise - invoice.paidPaise,
          dueDate: invoice.dueDate,
          status: invoice.status,
        }
      : null,
  };
}

export async function dashboardRoutes(app: FastifyInstance) {
  app.get("/dashboard/parent", async (req) => {
    const tenant = requireTenant(req);
    requirePermission(req, "dashboard:parent");
    const query = req.query as { studentId?: string };
    const ids = await parentStudentIds(tenant);
    if (query.studentId) {
      if (!ids.includes(query.studentId)) throw notFound();
    }
    const studentId = query.studentId ?? ids[0];
    if (!studentId) return { children: [], snapshot: null };
    const children = await prisma.student.findMany({
      where: { id: { in: ids }, institutionId: tenant.institutionId },
      select: { id: true, firstName: true, lastName: true },
    });
    const snapshot = await student360(tenant.institutionId, studentId);
    return { children, snapshot };
  });

  app.get("/dashboard/student", async (req) => {
    const tenant = requireTenant(req);
    requirePermission(req, "dashboard:student");
    const id = await studentSelfId(tenant);
    return student360(tenant.institutionId, id);
  });

  app.get("/dashboard/admin", async (req) => {
    const tenant = requireTenant(req);
    requirePermission(req, "dashboard:admin");
    const institutionId = tenant.institutionId;
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const [students, activeStudents, attendanceToday, assessments, upcoming, parentsActivated] =
      await Promise.all([
        prisma.student.count({ where: { institutionId } }),
        prisma.student.count({ where: { institutionId, status: "ACTIVE" } }),
        prisma.attendanceRecord.count({ where: { institutionId, date: today } }),
        prisma.assessment.count({ where: { institutionId, status: "DRAFT" } }),
        prisma.classSession.count({ where: { institutionId, date: { gte: today }, status: "SCHEDULED" } }),
        prisma.guardian.count({ where: { institutionId, userId: { not: null } } }),
      ]);
    return {
      kpis: {
        totalStudents: students,
        activeStudents,
        attendanceToday,
        pendingAssessments: assessments,
        upcomingClasses: upcoming,
        parentActivation: parentsActivated,
      },
    };
  });
}
