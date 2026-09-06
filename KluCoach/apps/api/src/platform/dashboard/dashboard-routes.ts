import type { FastifyInstance } from "fastify";
import { prisma } from "@klunex-edu/database";
import { notFound } from "../../lib/errors.js";
import { requirePermission, requireTenant } from "../identity/http-auth.js";
import { parentStudentIds, studentSelfId } from "../identity/scope.js";
import { assembleStudent360 } from "../students/student360.js";
import { assembleOnboarding } from "../pilot/onboarding.js";
import { writeAudit } from "../audit/write.js";

export async function dashboardRoutes(app: FastifyInstance) {
  app.get("/dashboard/parent", async (req) => {
    const tenant = requireTenant(req);
    requirePermission(req, "dashboard:parent");
    const query = req.query as { studentId?: string };
    const ids = await parentStudentIds(tenant);
    if (query.studentId && !ids.includes(query.studentId)) throw notFound();
    const children = await prisma.student.findMany({
      where: { id: { in: ids }, institutionId: tenant.institutionId },
      select: { id: true, firstName: true, lastName: true },
      orderBy: { firstName: "asc" },
    });
    const studentId = query.studentId ?? children[0]?.id;
    if (!studentId) return { children: [], snapshot: null };
    const snapshot = await assembleStudent360(tenant.institutionId, studentId);
    await writeAudit(req, "student360.view", "Student", studentId);
    return { children, snapshot };
  });

  app.get("/dashboard/student", async (req) => {
    const tenant = requireTenant(req);
    requirePermission(req, "dashboard:student");
    const id = await studentSelfId(tenant);
    const snapshot = await assembleStudent360(tenant.institutionId, id);
    await writeAudit(req, "student360.view", "Student", id);
    return snapshot;
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

  app.get("/dashboard/onboarding", async (req) => {
    const tenant = requireTenant(req);
    requirePermission(req, "dashboard:admin");
    return assembleOnboarding(tenant.institutionId);
  });
}
