import type { FastifyInstance } from "fastify";
import { prisma } from "@klunex-edu/database";
import {
  assessmentCreateSchema,
  assignmentCreateSchema,
  assignmentPatchSchema,
  assignmentSubmitSchema,
  attendanceMarkSchema,
  noticeCreateSchema,
  resultsUpsertSchema,
} from "@klunex-edu/shared";
import { writeAudit } from "../audit/write.js";
import { listSkipTake, parseListQuery, sendList } from "../../lib/listQuery.js";
import { forbidden, notFound, validationError } from "../../lib/errors.js";
import { requirePermission, requireTenant } from "../identity/http-auth.js";
import { assertTeacherBatchAccess, parentStudentIds, studentSelfId, teacherAssignedBatchIds } from "../identity/scope.js";
import {
  assessmentInTenant,
  assignmentInTenant,
  batchInTenant,
  branchInTenant,
  classSessionInTenant,
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
    const query = req.query as { studentId?: string; batchId?: string; date?: string; classSessionId?: string };
    let studentIds: string[] | null = null;
    if (tenant.role === "PARENT") studentIds = await parentStudentIds(tenant);
    if (tenant.role === "STUDENT") studentIds = [await studentSelfId(tenant)];
    if (query.studentId) {
      if (studentIds && !studentIds.includes(query.studentId)) throw notFound();
      await studentInTenant(tenant.institutionId, query.studentId);
    }
    if (query.batchId) {
      if (tenant.role === "TEACHER") await assertTeacherBatchAccess(tenant, query.batchId);
      else await batchInTenant(tenant.institutionId, query.batchId);
    }
    if (query.classSessionId) await classSessionInTenant(tenant.institutionId, query.classSessionId);
    return prisma.attendanceRecord.findMany({
      where: {
        institutionId: tenant.institutionId,
        ...visibleStudentFilter(tenant.role, studentIds),
        ...(query.studentId ? { studentId: query.studentId } : {}),
        ...(query.batchId ? { batchId: query.batchId } : {}),
        ...(query.date ? { date: new Date(query.date) } : {}),
        ...(query.classSessionId ? { classSessionId: query.classSessionId } : {}),
      },
      include: { student: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: { date: "desc" },
      take: 400,
    });
  });

  app.post("/attendance", async (req, reply) => {
    const tenant = requireTenant(req);
    requirePermission(req, "attendance:write");
    const body = parse(attendanceMarkSchema, req.body);
    await assertTeacherBatchAccess(tenant, body.batchId);
    if (body.classSessionId) {
      const session = await prisma.classSession.findFirst({
        where: { id: body.classSessionId, institutionId: tenant.institutionId, batchId: body.batchId },
      });
      if (!session) throw notFound();
    }
    for (const rec of body.records) {
      await studentInTenant(tenant.institutionId, rec.studentId);
      const enrolled = await prisma.batchEnrollment.findFirst({
        where: { batchId: body.batchId, studentId: rec.studentId },
      });
      if (!enrolled) throw notFound();
    }
    const date = new Date(body.date);
    const rows = [];
    for (const rec of body.records) {
      const existing = await prisma.attendanceRecord.findFirst({
        where: {
          institutionId: tenant.institutionId,
          studentId: rec.studentId,
          batchId: body.batchId,
          date,
          classSessionId: body.classSessionId ?? null,
        },
      });
      const data = {
        institutionId: tenant.institutionId,
        studentId: rec.studentId,
        batchId: body.batchId,
        classSessionId: body.classSessionId,
        date,
        status: rec.status,
        markedById: tenant.id,
      };
      const row = existing
        ? await prisma.attendanceRecord.update({
            where: { id: existing.id },
            data: { status: rec.status, markedById: tenant.id },
          })
        : await prisma.attendanceRecord.create({ data });
      rows.push(row);
    }
    await writeAudit(req, "attendance.mark", "AttendanceRecord", body.batchId, {
      count: rows.length,
      date: body.date,
    });
    return reply.code(201).send({ records: rows });
  });

  app.get("/assessments", async (req) => {
    const tenant = requireTenant(req);
    requirePermission(req, "assessments:read");
    let batchIds: string[] | undefined;
    if (tenant.role === "TEACHER") batchIds = await teacherAssignedBatchIds(tenant);
    if (tenant.role === "PARENT") {
      const ids = await parentStudentIds(tenant);
      const enrolls = await prisma.batchEnrollment.findMany({ where: { studentId: { in: ids } } });
      batchIds = enrolls.map((e) => e.batchId);
    }
    if (tenant.role === "STUDENT") {
      const sid = await studentSelfId(tenant);
      const enrolls = await prisma.batchEnrollment.findMany({ where: { studentId: sid } });
      batchIds = enrolls.map((e) => e.batchId);
    }
    return prisma.assessment.findMany({
      where: {
        institutionId: tenant.institutionId,
        ...(batchIds ? { batchId: { in: batchIds } } : {}),
      },
      include: { subject: true, batch: true, _count: { select: { results: true } } },
      orderBy: { date: "desc" },
    });
  });

  app.get("/assessments/:id", async (req) => {
    const tenant = requireTenant(req);
    requirePermission(req, "assessments:read");
    const { id } = req.params as { id: string };
    const assessment = await prisma.assessment.findFirst({
      where: { id, institutionId: tenant.institutionId },
      include: {
        subject: true,
        batch: true,
        results: { include: { student: { select: { id: true, firstName: true, lastName: true } } } },
      },
    });
    if (!assessment) throw notFound();
    if (tenant.role === "TEACHER") {
      const assigned = await teacherAssignedBatchIds(tenant);
      if (!assigned.includes(assessment.batchId)) throw notFound();
    }
    if (tenant.role === "PARENT") {
      const ids = await parentStudentIds(tenant);
      const enroll = await prisma.batchEnrollment.findFirst({
        where: { batchId: assessment.batchId, studentId: { in: ids } },
      });
      if (!enroll) throw notFound();
    }
    if (tenant.role === "STUDENT") {
      const sid = await studentSelfId(tenant);
      const enroll = await prisma.batchEnrollment.findFirst({
        where: { batchId: assessment.batchId, studentId: sid },
      });
      if (!enroll) throw notFound();
    }
    return assessment;
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
    const max = Number(assessment.maxMarks);
    for (const rec of body.results) {
      await studentInTenant(tenant.institutionId, rec.studentId);
      if (rec.marks > max) throw validationError(`marks cannot exceed ${max}`);
      const enrolled = await prisma.batchEnrollment.findFirst({
        where: { batchId: assessment.batchId, studentId: rec.studentId },
      });
      if (!enrolled) throw notFound();
    }
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
    const list = parseListQuery((req.query ?? {}) as Record<string, unknown>);
    let batchIds: string[] | undefined;
    let submissionStudentIds: string[] | undefined;
    if (tenant.role === "TEACHER") batchIds = await teacherAssignedBatchIds(tenant);
    if (tenant.role === "PARENT") {
      submissionStudentIds = await parentStudentIds(tenant);
      const enrolls = await prisma.batchEnrollment.findMany({ where: { studentId: { in: submissionStudentIds } } });
      batchIds = enrolls.map((e) => e.batchId);
    }
    if (tenant.role === "STUDENT") {
      const sid = await studentSelfId(tenant);
      submissionStudentIds = [sid];
      const enrolls = await prisma.batchEnrollment.findMany({ where: { studentId: sid } });
      batchIds = enrolls.map((e) => e.batchId);
    }
    if (list.batchId) {
      if (tenant.role === "TEACHER") await assertTeacherBatchAccess(tenant, list.batchId);
      else await batchInTenant(tenant.institutionId, list.batchId);
      if (batchIds && !batchIds.includes(list.batchId)) throw notFound();
      batchIds = [list.batchId];
    }
    const where = {
      institutionId: tenant.institutionId,
      ...(batchIds ? { batchId: { in: batchIds } } : {}),
      ...(list.q ? { title: { contains: list.q, mode: "insensitive" as const } } : {}),
    };
    const { skip, take } = listSkipTake(list);
    const [items, total] = await Promise.all([
      prisma.assignment.findMany({
        where,
        include: {
          subject: true,
          batch: true,
          submissions: submissionStudentIds ? { where: { studentId: { in: submissionStudentIds } } } : true,
        },
        orderBy: { dueAt: "asc" },
        skip,
        take,
      }),
      prisma.assignment.count({ where }),
    ]);
    return sendList(list, items, total);
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
    const row = await assignmentInTenant(tenant.institutionId, id);
    if (tenant.role === "TEACHER") {
      const assigned = await teacherAssignedBatchIds(tenant);
      if (!assigned.includes(row.batchId)) throw notFound();
    }
    if (tenant.role === "PARENT" || tenant.role === "STUDENT") {
      const ids = tenant.role === "PARENT" ? await parentStudentIds(tenant) : [await studentSelfId(tenant)];
      const enroll = await prisma.batchEnrollment.findFirst({
        where: { batchId: row.batchId, studentId: { in: ids } },
      });
      if (!enroll) throw notFound();
    }
    return row;
  });

  app.patch("/assignments/:id", async (req) => {
    const tenant = requireTenant(req);
    requirePermission(req, "assignments:write");
    const { id } = req.params as { id: string };
    const existing = await assignmentInTenant(tenant.institutionId, id);
    await assertTeacherBatchAccess(tenant, existing.batchId);
    const body = parse(assignmentPatchSchema, req.body);
    const row = await prisma.assignment.update({
      where: { id },
      data: {
        ...(body.title ? { title: body.title } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.dueAt ? { dueAt: new Date(body.dueAt) } : {}),
      },
    });
    await writeAudit(req, "assignment.update", "Assignment", id);
    return row;
  });

  app.post("/assignments/:id/submit", async (req) => {
    const tenant = requireTenant(req);
    requirePermission(req, "assignments:write");
    if (tenant.role !== "STUDENT") throw forbidden();
    const { id } = req.params as { id: string };
    parse(assignmentSubmitSchema, req.body ?? { status: "SUBMITTED" });
    const assignment = await assignmentInTenant(tenant.institutionId, id);
    const studentId = await studentSelfId(tenant);
    const enroll = await prisma.batchEnrollment.findFirst({
      where: { batchId: assignment.batchId, studentId },
    });
    if (!enroll) throw notFound();
    const submission = await prisma.assignmentSubmission.upsert({
      where: { assignmentId_studentId: { assignmentId: id, studentId } },
      update: { status: "SUBMITTED", submittedAt: new Date() },
      create: { assignmentId: id, studentId, status: "SUBMITTED", submittedAt: new Date() },
    });
    await writeAudit(req, "assignment.submit", "AssignmentSubmission", submission.id);
    return submission;
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
