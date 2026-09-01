import type { FastifyInstance } from "fastify";
import { prisma } from "@klunex-edu/database";
import {
  assessmentCreateSchema,
  assignmentCreateSchema,
  attendanceMarkSchema,
  noticeCreateSchema,
  resultsUpsertSchema,
} from "@klunex-edu/shared";
import { writeAudit } from "../audit/write.js";
import { notFound, validationError } from "../../lib/errors.js";
import { requirePermission, requireTenant } from "../identity/http-auth.js";
import { assertTeacherBatchAccess, parentStudentIds, studentSelfId } from "../identity/scope.js";
import {
  assessmentInTenant,
  assignmentInTenant,
  batchInTenant,
  branchInTenant,
  noticeInTenant,
  studentInTenant,
  subjectInTenant,
} from "../tenancy/scope.js";

function parse<T>(schema: { safeParse: (v: unknown) => { success: true; data: T } | { success: false; error: { issues: { message: string }[] } } }, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) throw validationError(result.error.issues.map((i) => i.message).join("; "));
  return result.data;
}

function visibleStudentFilter(role: string, ids: string[] | null) {
  if (role === "PARENT" || role === "STUDENT") return { studentId: { in: ids ?? [] } };
  return {};
}

export async function academicWorkRoutes(app: FastifyInstance) {
  app.get("/attendance", async (req) => {
    const tenant = requireTenant(req);
    requirePermission(req, "attendance:read");
    const query = req.query as { studentId?: string; batchId?: string };
    let studentIds: string[] | null = null;
    if (tenant.role === "PARENT") studentIds = await parentStudentIds(tenant);
    if (tenant.role === "STUDENT") studentIds = [await studentSelfId(tenant)];
    if (query.studentId) {
      if (studentIds && !studentIds.includes(query.studentId)) throw notFound();
      await studentInTenant(tenant.institutionId, query.studentId);
    }
    if (query.batchId) await batchInTenant(tenant.institutionId, query.batchId);
    return prisma.attendanceRecord.findMany({
      where: {
        institutionId: tenant.institutionId,
        ...visibleStudentFilter(tenant.role, studentIds),
        ...(query.studentId ? { studentId: query.studentId } : {}),
        ...(query.batchId ? { batchId: query.batchId } : {}),
      },
      orderBy: { date: "desc" },
      take: 400,
    });
  });

  app.post("/attendance", async (req, reply) => {
    const tenant = requireTenant(req);
    requirePermission(req, "attendance:write");
    const body = parse(attendanceMarkSchema, req.body);
    await assertTeacherBatchAccess(tenant, body.batchId);
    for (const rec of body.records) {
      await studentInTenant(tenant.institutionId, rec.studentId);
    }
    const date = new Date(body.date);
    const rows = [];
    for (const rec of body.records) {
      const data = {
        institutionId: tenant.institutionId,
        studentId: rec.studentId,
        batchId: body.batchId,
        classSessionId: body.classSessionId,
        date,
        status: rec.status,
        markedById: tenant.id,
      };
      const row = body.classSessionId
        ? await prisma.attendanceRecord.upsert({
            where: { classSessionId_studentId: { classSessionId: body.classSessionId, studentId: rec.studentId } },
            update: { status: rec.status, markedById: tenant.id },
            create: data,
          })
        : await prisma.attendanceRecord.create({ data });
      rows.push(row);
    }
    await writeAudit(req, "attendance.mark", "AttendanceRecord", body.batchId, { count: rows.length });
    return reply.code(201).send({ records: rows });
  });

  app.get("/assessments", async (req) => {
    const tenant = requireTenant(req);
    requirePermission(req, "assessments:read");
    return prisma.assessment.findMany({
      where: { institutionId: tenant.institutionId },
      include: { subject: true, batch: true, _count: { select: { results: true } } },
      orderBy: { date: "desc" },
    });
  });

  app.post("/assessments", async (req, reply) => {
    const tenant = requireTenant(req);
    requirePermission(req, "assessments:write");
    const body = parse(assessmentCreateSchema, req.body);
    await assertTeacherBatchAccess(tenant, body.batchId);
    await subjectInTenant(tenant.institutionId, body.subjectId);
    const row = await prisma.assessment.create({
      data: {
        institutionId: tenant.institutionId,
        createdById: tenant.id,
        name: body.name,
        subjectId: body.subjectId,
        batchId: body.batchId,
        date: new Date(body.date),
        type: body.type ?? "TEST",
        maxMarks: body.maxMarks,
        passingMarks: body.passingMarks,
      },
    });
    await writeAudit(req, "assessment.create", "Assessment", row.id);
    return reply.code(201).send(row);
  });

  app.get("/results", async (req) => {
    const tenant = requireTenant(req);
    requirePermission(req, "assessments:read");
    const query = req.query as { assessmentId?: string; studentId?: string };
    let studentIds: string[] | null = null;
    if (tenant.role === "PARENT") studentIds = await parentStudentIds(tenant);
    if (tenant.role === "STUDENT") studentIds = [await studentSelfId(tenant)];
    if (query.studentId) {
      if (studentIds && !studentIds.includes(query.studentId)) throw notFound();
      await studentInTenant(tenant.institutionId, query.studentId);
    }
    if (query.assessmentId) await assessmentInTenant(tenant.institutionId, query.assessmentId);
    return prisma.assessmentResult.findMany({
      where: {
        institutionId: tenant.institutionId,
        ...visibleStudentFilter(tenant.role, studentIds),
        ...(query.assessmentId ? { assessmentId: query.assessmentId } : {}),
        ...(query.studentId ? { studentId: query.studentId } : {}),
      },
      include: { assessment: { include: { subject: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
  });

  app.post("/assessments/:id/results", async (req) => {
    const tenant = requireTenant(req);
    requirePermission(req, "assessments:write");
    const { id } = req.params as { id: string };
    const assessment = await prisma.assessment.findFirst({
      where: { id, institutionId: tenant.institutionId },
      include: { batch: true },
    });
    if (!assessment) throw notFound();
    await assertTeacherBatchAccess(tenant, assessment.batchId);
    const body = parse(resultsUpsertSchema, req.body);
    for (const rec of body.results) {
      await studentInTenant(tenant.institutionId, rec.studentId);
    }
    const max = Number(assessment.maxMarks);
    const rankingEnabled = assessment.batch.rankingEnabled;
    const computed = body.results.map((r) => ({
      ...r,
      percentage: max === 0 ? 0 : Math.round((r.marks / max) * 10000) / 100,
    }));
    computed.sort((a, b) => b.marks - a.marks);
    const ops = computed.map((r, idx) =>
      prisma.assessmentResult.upsert({
        where: { assessmentId_studentId: { assessmentId: id, studentId: r.studentId } },
        update: {
          marks: r.marks,
          percentage: r.percentage,
          grade: r.grade,
          rank: rankingEnabled ? idx + 1 : null,
        },
        create: {
          institutionId: tenant.institutionId,
          assessmentId: id,
          studentId: r.studentId,
          marks: r.marks,
          percentage: r.percentage,
          grade: r.grade,
          rank: rankingEnabled ? idx + 1 : null,
        },
      }),
    );
    const rows = await prisma.$transaction(ops);
    await prisma.assessment.update({ where: { id }, data: { status: "PUBLISHED" } });
    await writeAudit(req, "results.upsert", "Assessment", id);
    return { results: rows };
  });

  app.get("/assignments", async (req) => {
    const tenant = requireTenant(req);
    requirePermission(req, "assignments:read");
    const query = req.query as { batchId?: string };
    if (query.batchId) await batchInTenant(tenant.institutionId, query.batchId);
    return prisma.assignment.findMany({
      where: {
        institutionId: tenant.institutionId,
        ...(query.batchId ? { batchId: query.batchId } : {}),
      },
      include: { subject: true, batch: true, submissions: true },
      orderBy: { dueAt: "asc" },
    });
  });

  app.post("/assignments", async (req, reply) => {
    const tenant = requireTenant(req);
    requirePermission(req, "assignments:write");
    const body = parse(assignmentCreateSchema, req.body);
    await assertTeacherBatchAccess(tenant, body.batchId);
    await subjectInTenant(tenant.institutionId, body.subjectId);
    const row = await prisma.assignment.create({
      data: {
        institutionId: tenant.institutionId,
        createdById: tenant.id,
        title: body.title,
        description: body.description,
        subjectId: body.subjectId,
        batchId: body.batchId,
        dueAt: new Date(body.dueAt),
      },
    });
    const enrolls = await prisma.batchEnrollment.findMany({ where: { batchId: body.batchId } });
    if (enrolls.length) {
      await prisma.assignmentSubmission.createMany({
        data: enrolls.map((e) => ({ assignmentId: row.id, studentId: e.studentId, status: "PENDING" })),
      });
    }
    await writeAudit(req, "assignment.create", "Assignment", row.id);
    return reply.code(201).send(row);
  });

  app.get("/assignments/:id", async (req) => {
    const tenant = requireTenant(req);
    requirePermission(req, "assignments:read");
    const { id } = req.params as { id: string };
    return assignmentInTenant(tenant.institutionId, id);
  });

  app.get("/notices", async (req) => {
    const tenant = requireTenant(req);
    requirePermission(req, "notices:read");
    let studentIds: string[] | null = null;
    if (tenant.role === "PARENT") studentIds = await parentStudentIds(tenant);
    if (tenant.role === "STUDENT") studentIds = [await studentSelfId(tenant)];
    if (studentIds) {
      const enrolls = await prisma.batchEnrollment.findMany({ where: { studentId: { in: studentIds } } });
      const batchIds = enrolls.map((e) => e.batchId);
      return prisma.notice.findMany({
        where: {
          institutionId: tenant.institutionId,
          OR: [
            { audience: "INSTITUTION" },
            { batchId: { in: batchIds } },
            { students: { some: { studentId: { in: studentIds } } } },
          ],
        },
        orderBy: { publishedAt: "desc" },
        take: 50,
      });
    }
    return prisma.notice.findMany({
      where: { institutionId: tenant.institutionId },
      orderBy: { publishedAt: "desc" },
      take: 100,
    });
  });

  app.post("/notices", async (req, reply) => {
    const tenant = requireTenant(req);
    requirePermission(req, "notices:write");
    const body = parse(noticeCreateSchema, req.body);
    if (body.branchId) await branchInTenant(tenant.institutionId, body.branchId);
    if (body.batchId) await batchInTenant(tenant.institutionId, body.batchId);
    for (const studentId of body.studentIds ?? []) {
      await studentInTenant(tenant.institutionId, studentId);
    }
    const notice = await prisma.notice.create({
      data: {
        institutionId: tenant.institutionId,
        createdById: tenant.id,
        title: body.title,
        body: body.body,
        audience: body.audience ?? "INSTITUTION",
        branchId: body.branchId,
        batchId: body.batchId,
        students: body.studentIds
          ? { create: body.studentIds.map((studentId) => ({ studentId })) }
          : undefined,
      },
    });
    await writeAudit(req, "notice.create", "Notice", notice.id);
    return reply.code(201).send(notice);
  });

  app.get("/notices/:id", async (req) => {
    const tenant = requireTenant(req);
    requirePermission(req, "notices:read");
    const { id } = req.params as { id: string };
    return noticeInTenant(tenant.institutionId, id);
  });
}
