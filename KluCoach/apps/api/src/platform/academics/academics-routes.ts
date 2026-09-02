import type { FastifyInstance } from "fastify";
import { prisma } from "@klunex-edu/database";
import { batchCreateSchema, batchPatchSchema, sessionCreateSchema, sessionPatchSchema, timetableCreateSchema, timetablePatchSchema } from "@klunex-edu/shared";
import { writeAudit } from "../audit/write.js";
import { onSessionChanged } from "../communication/notification-events.js";
import { listSkipTake, orderBy, parseListQuery, sendList } from "../../lib/listQuery.js";
import { notFound, validationError } from "../../lib/errors.js";
import { requirePermission, requireTenant } from "../identity/http-auth.js";
import { parentStudentIds, studentSelfId, teacherAssignedBatchIds, assertTeacherBatchAccess } from "../identity/scope.js";
import {
  academicYearInTenant,
  batchInTenant,
  branchInTenant,
  classSessionInTenant,
  programInTenant,
  studentInTenant,
  subjectInTenant,
  teacherInTenant,
  timetableSlotInTenant,
} from "../tenancy/scope.js";

function parse<T>(schema: { safeParse: (v: unknown) => { success: true; data: T } | { success: false; error: { issues: { message: string }[] } } }, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) throw validationError(result.error.issues.map((i) => i.message).join("; "));
  return result.data;
}

export async function academicsRoutes(app: FastifyInstance) {
  app.get("/branches", async (req) => {
    const tenant = requireTenant(req);
    return prisma.branch.findMany({ where: { institutionId: tenant.institutionId }, orderBy: { name: "asc" } });
  });

  app.get("/branches/:id", async (req) => {
    const tenant = requireTenant(req);
    const { id } = req.params as { id: string };
    return branchInTenant(tenant.institutionId, id);
  });

  app.post("/branches", async (req, reply) => {
    const tenant = requireTenant(req);
    requirePermission(req, "institution:write");
    const body = req.body as { name: string; city?: string; state?: string };
    if (!body.name) throw validationError("name required");
    const branch = await prisma.branch.create({
      data: { institutionId: tenant.institutionId, name: body.name, city: body.city, state: body.state },
    });
    return reply.code(201).send(branch);
  });

  app.get("/academic-years", async (req) => {
    const tenant = requireTenant(req);
    return prisma.academicYear.findMany({ where: { institutionId: tenant.institutionId }, orderBy: { startDate: "desc" } });
  });

  app.get("/programs", async (req) => {
    const tenant = requireTenant(req);
    return prisma.program.findMany({ where: { institutionId: tenant.institutionId }, orderBy: { name: "asc" } });
  });

  app.get("/programs/:id", async (req) => {
    const tenant = requireTenant(req);
    const { id } = req.params as { id: string };
    return programInTenant(tenant.institutionId, id);
  });

  app.post("/programs", async (req, reply) => {
    const tenant = requireTenant(req);
    requirePermission(req, "batches:write");
    const body = req.body as { name: string; code?: string };
    if (!body.name) throw validationError("name required");
    const row = await prisma.program.create({
      data: { institutionId: tenant.institutionId, name: body.name, code: body.code },
    });
    return reply.code(201).send(row);
  });

  app.get("/subjects", async (req) => {
    const tenant = requireTenant(req);
    return prisma.subject.findMany({ where: { institutionId: tenant.institutionId }, orderBy: { name: "asc" } });
  });

  app.get("/subjects/:id", async (req) => {
    const tenant = requireTenant(req);
    const { id } = req.params as { id: string };
    return subjectInTenant(tenant.institutionId, id);
  });

  app.post("/subjects", async (req, reply) => {
    const tenant = requireTenant(req);
    requirePermission(req, "batches:write");
    const body = req.body as { name: string; code?: string };
    if (!body.name) throw validationError("name required");
    const row = await prisma.subject.create({
      data: { institutionId: tenant.institutionId, name: body.name, code: body.code },
    });
    return reply.code(201).send(row);
  });

  app.get("/batches", async (req) => {
    const tenant = requireTenant(req);
    requirePermission(req, "batches:read");
    const list = parseListQuery((req.query ?? {}) as Record<string, unknown>);
    if (list.branchId) await branchInTenant(tenant.institutionId, list.branchId);
    let teacherBatchIds: string[] | undefined;
    if (tenant.role === "TEACHER") teacherBatchIds = await teacherAssignedBatchIds(tenant);
    const where = {
      institutionId: tenant.institutionId,
      ...(list.status ? { status: list.status as "ACTIVE" } : {}),
      ...(list.branchId ? { branchId: list.branchId } : {}),
      ...(teacherBatchIds ? { id: { in: teacherBatchIds } } : {}),
      ...(list.q
        ? {
            OR: [
              { name: { contains: list.q, mode: "insensitive" as const } },
              { program: { name: { contains: list.q, mode: "insensitive" as const } } },
            ],
          }
        : {}),
    };
    const { skip, take } = listSkipTake(list);
    const [items, total] = await Promise.all([
      prisma.batch.findMany({
        where,
        include: {
          program: true,
          branch: true,
          academicYear: { select: { id: true, name: true } },
          _count: { select: { enrollments: true } },
        },
        orderBy: orderBy(list.sort, list.dir, ["name", "createdAt"] as const, "name"),
        skip,
        take,
      }),
      prisma.batch.count({ where }),
    ]);
    return sendList(list, items, total);
  });

  app.get("/batches/:id", async (req) => {
    const tenant = requireTenant(req);
    requirePermission(req, "batches:read");
    const { id } = req.params as { id: string };
    if (tenant.role === "TEACHER") {
      const assigned = await teacherAssignedBatchIds(tenant);
      if (!assigned.includes(id)) {
        await batchInTenant(tenant.institutionId, id);
        throw notFound();
      }
    }
    const batch = await prisma.batch.findFirst({
      where: { id, institutionId: tenant.institutionId },
      include: {
        program: true,
        branch: true,
        academicYear: true,
        subjects: { include: { subject: true } },
        enrollments: {
          include: {
            student: { select: { id: true, firstName: true, lastName: true, admissionNumber: true, status: true } },
          },
        },
        _count: { select: { enrollments: true } },
      },
    });
    if (!batch) throw notFound();
    return batch;
  });

  app.post("/batches", async (req, reply) => {
    const tenant = requireTenant(req);
    requirePermission(req, "batches:write");
    const body = parse(batchCreateSchema, req.body);
    await branchInTenant(tenant.institutionId, body.branchId);
    await academicYearInTenant(tenant.institutionId, body.academicYearId);
    await programInTenant(tenant.institutionId, body.programId);
    for (const subjectId of body.subjectIds ?? []) await subjectInTenant(tenant.institutionId, subjectId);
    const batch = await prisma.batch.create({
      data: {
        institutionId: tenant.institutionId,
        name: body.name,
        branchId: body.branchId,
        academicYearId: body.academicYearId,
        programId: body.programId,
        startDate: body.startDate ? new Date(body.startDate) : undefined,
        endDate: body.endDate ? new Date(body.endDate) : undefined,
        capacity: body.capacity,
        rankingEnabled: body.rankingEnabled ?? false,
        subjects: body.subjectIds ? { create: body.subjectIds.map((subjectId) => ({ subjectId })) } : undefined,
      },
    });
    await writeAudit(req, "batch.create", "Batch", batch.id);
    return reply.code(201).send(batch);
  });

  app.patch("/batches/:id", async (req) => {
    const tenant = requireTenant(req);
    requirePermission(req, "batches:write");
    const { id } = req.params as { id: string };
    await batchInTenant(tenant.institutionId, id);
    const body = parse(batchPatchSchema, req.body);
    if (body.branchId) await branchInTenant(tenant.institutionId, body.branchId);
    if (body.academicYearId) await academicYearInTenant(tenant.institutionId, body.academicYearId);
    if (body.programId) await programInTenant(tenant.institutionId, body.programId);
    const batch = await prisma.batch.update({
      where: { id },
      data: {
        ...(body.name ? { name: body.name } : {}),
        ...(body.branchId ? { branchId: body.branchId } : {}),
        ...(body.academicYearId ? { academicYearId: body.academicYearId } : {}),
        ...(body.programId ? { programId: body.programId } : {}),
        ...(body.startDate ? { startDate: new Date(body.startDate) } : {}),
        ...(body.endDate ? { endDate: new Date(body.endDate) } : {}),
        ...(body.capacity !== undefined ? { capacity: body.capacity } : {}),
        ...(body.rankingEnabled !== undefined ? { rankingEnabled: body.rankingEnabled } : {}),
        ...(body.status ? { status: body.status } : {}),
      },
    });
    await writeAudit(req, "batch.update", "Batch", id);
    return batch;
  });

  app.post("/batches/:id/enrollments", async (req) => {
    const tenant = requireTenant(req);
    requirePermission(req, "students:write");
    const { id } = req.params as { id: string };
    const body = req.body as { studentId: string };
    const batch = await prisma.batch.findFirst({ where: { id, institutionId: tenant.institutionId } });
    if (!batch) throw notFound();
    await studentInTenant(tenant.institutionId, body.studentId);
    const enrollment = await prisma.batchEnrollment.upsert({
      where: { batchId_studentId: { batchId: id, studentId: body.studentId } },
      update: { status: "ACTIVE" },
      create: { batchId: id, studentId: body.studentId },
    });
    return enrollment;
  });

  app.get("/sessions", async (req) => {
    const tenant = requireTenant(req);
    requirePermission(req, "timetable:read");
    const query = req.query as { batchId?: string; date?: string };
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
    if (query.batchId) {
      if (tenant.role === "TEACHER") await assertTeacherBatchAccess(tenant, query.batchId);
      else if (tenant.role === "PARENT" || tenant.role === "STUDENT") {
        if (!batchIds?.includes(query.batchId)) throw notFound();
      } else {
        await batchInTenant(tenant.institutionId, query.batchId);
      }
      batchIds = [query.batchId];
    }
    return prisma.classSession.findMany({
      where: {
        institutionId: tenant.institutionId,
        ...(batchIds ? { batchId: { in: batchIds } } : {}),
        ...(query.date ? { date: new Date(query.date) } : {}),
      },
      include: { subject: true, teacher: true, batch: true },
      orderBy: [{ date: "asc" }, { startMinute: "asc" }],
      take: 200,
    });
  });

  app.get("/sessions/:id", async (req) => {
    const tenant = requireTenant(req);
    requirePermission(req, "timetable:read");
    const { id } = req.params as { id: string };
    const session = await classSessionInTenant(tenant.institutionId, id);
    if (tenant.role === "TEACHER") {
      const assigned = await teacherAssignedBatchIds(tenant);
      if (!assigned.includes(session.batchId)) throw notFound();
    }
    if (tenant.role === "PARENT" || tenant.role === "STUDENT") {
      const ids = tenant.role === "PARENT" ? await parentStudentIds(tenant) : [await studentSelfId(tenant)];
      const enroll = await prisma.batchEnrollment.findFirst({
        where: { batchId: session.batchId, studentId: { in: ids } },
      });
      if (!enroll) throw notFound();
    }
    return session;
  });

  app.post("/sessions", async (req, reply) => {
    const tenant = requireTenant(req);
    requirePermission(req, "timetable:write");
    const body = parse(sessionCreateSchema, req.body);
    await assertTeacherBatchAccess(tenant, body.batchId);
    await subjectInTenant(tenant.institutionId, body.subjectId);
    if (body.teacherId) await teacherInTenant(tenant.institutionId, body.teacherId);
    const session = await prisma.classSession.create({
      data: {
        institutionId: tenant.institutionId,
        batchId: body.batchId,
        subjectId: body.subjectId,
        teacherId: body.teacherId,
        date: new Date(body.date),
        startMinute: body.startMinute,
        endMinute: body.endMinute,
        room: body.room,
        status: body.status ?? "SCHEDULED",
      },
    });
    await writeAudit(req, "session.create", "ClassSession", session.id);
    return reply.code(201).send(session);
  });

  app.patch("/sessions/:id", async (req) => {
    const tenant = requireTenant(req);
    requirePermission(req, "timetable:write");
    const { id } = req.params as { id: string };
    const existing = await classSessionInTenant(tenant.institutionId, id);
    await assertTeacherBatchAccess(tenant, existing.batchId);
    const body = parse(sessionPatchSchema, req.body);
    if (body.batchId) await assertTeacherBatchAccess(tenant, body.batchId);
    if (body.subjectId) await subjectInTenant(tenant.institutionId, body.subjectId);
    if (body.teacherId) await teacherInTenant(tenant.institutionId, body.teacherId);
    const session = await prisma.classSession.update({
      where: { id },
      data: {
        ...(body.batchId ? { batchId: body.batchId } : {}),
        ...(body.subjectId ? { subjectId: body.subjectId } : {}),
        ...(body.teacherId !== undefined ? { teacherId: body.teacherId } : {}),
        ...(body.date ? { date: new Date(body.date) } : {}),
        ...(body.startMinute !== undefined ? { startMinute: body.startMinute } : {}),
        ...(body.endMinute !== undefined ? { endMinute: body.endMinute } : {}),
        ...(body.room !== undefined ? { room: body.room } : {}),
        ...(body.status ? { status: body.status } : {}),
      },
    });
    await writeAudit(req, "session.update", "ClassSession", id);
    await onSessionChanged(tenant.institutionId, existing, session);
    return session;
  });

  app.get("/timetable", async (req) => {
    const tenant = requireTenant(req);
    requirePermission(req, "timetable:read");
    const user = tenant;
    const query = req.query as { batchId?: string; studentId?: string };
    const list = parseListQuery((req.query ?? {}) as Record<string, unknown>);
    let batchIds: string[] | undefined;
    if (user.role === "PARENT") {
      const ids = await parentStudentIds(user);
      const enrolls = await prisma.batchEnrollment.findMany({ where: { studentId: { in: ids } } });
      batchIds = enrolls.map((e) => e.batchId);
    } else if (user.role === "STUDENT") {
      const sid = await studentSelfId(user);
      const enrolls = await prisma.batchEnrollment.findMany({ where: { studentId: sid } });
      batchIds = enrolls.map((e) => e.batchId);
    } else if (user.role === "TEACHER") {
      batchIds = await teacherAssignedBatchIds(user);
    }
    if (query.batchId) {
      if (user.role === "TEACHER") await assertTeacherBatchAccess(user, query.batchId);
      else await batchInTenant(tenant.institutionId, query.batchId);
      batchIds = [query.batchId];
    }
    const where = {
      institutionId: tenant.institutionId,
      ...(batchIds ? { batchId: { in: batchIds } } : {}),
      ...(list.q
        ? {
            OR: [
              { room: { contains: list.q, mode: "insensitive" as const } },
              { subject: { name: { contains: list.q, mode: "insensitive" as const } } },
              { batch: { name: { contains: list.q, mode: "insensitive" as const } } },
            ],
          }
        : {}),
    };
    const { skip, take } = listSkipTake(list);
    const [items, total] = await Promise.all([
      prisma.timetableSlot.findMany({
        where,
        include: { subject: true, teacher: true, batch: true },
        orderBy: [{ dayOfWeek: "asc" }, { startMinute: "asc" }],
        skip,
        take,
      }),
      prisma.timetableSlot.count({ where }),
    ]);
    return sendList(list, items, total);
  });

  app.get("/timetable/:id", async (req) => {
    const tenant = requireTenant(req);
    requirePermission(req, "timetable:read");
    const { id } = req.params as { id: string };
    const slot = await timetableSlotInTenant(tenant.institutionId, id);
    if (tenant.role === "TEACHER") {
      const assigned = await teacherAssignedBatchIds(tenant);
      if (!assigned.includes(slot.batchId)) throw notFound();
    }
    if (tenant.role === "PARENT" || tenant.role === "STUDENT") {
      const ids = tenant.role === "PARENT" ? await parentStudentIds(tenant) : [await studentSelfId(tenant)];
      const enroll = await prisma.batchEnrollment.findFirst({
        where: { batchId: slot.batchId, studentId: { in: ids } },
      });
      if (!enroll) throw notFound();
    }
    return slot;
  });

  app.post("/timetable", async (req, reply) => {
    const tenant = requireTenant(req);
    requirePermission(req, "timetable:write");
    const body = parse(timetableCreateSchema, req.body);
    await assertTeacherBatchAccess(tenant, body.batchId);
    await subjectInTenant(tenant.institutionId, body.subjectId);
    if (body.teacherId) await teacherInTenant(tenant.institutionId, body.teacherId);
    const slot = await prisma.timetableSlot.create({
      data: {
        institutionId: tenant.institutionId,
        batchId: body.batchId,
        subjectId: body.subjectId,
        teacherId: body.teacherId,
        dayOfWeek: body.dayOfWeek,
        startMinute: body.startMinute,
        endMinute: body.endMinute,
        room: body.room,
      },
    });
    await writeAudit(req, "timetable.create", "TimetableSlot", slot.id);
    return reply.code(201).send(slot);
  });

  app.patch("/timetable/:id", async (req) => {
    const tenant = requireTenant(req);
    requirePermission(req, "timetable:write");
    const { id } = req.params as { id: string };
    const existing = await timetableSlotInTenant(tenant.institutionId, id);
    await assertTeacherBatchAccess(tenant, existing.batchId);
    const body = parse(timetablePatchSchema, req.body);
    if (body.batchId) await assertTeacherBatchAccess(tenant, body.batchId);
    if (body.subjectId) await subjectInTenant(tenant.institutionId, body.subjectId);
    if (body.teacherId) await teacherInTenant(tenant.institutionId, body.teacherId);
    const slot = await prisma.timetableSlot.update({
      where: { id },
      data: {
        ...(body.batchId ? { batchId: body.batchId } : {}),
        ...(body.subjectId ? { subjectId: body.subjectId } : {}),
        ...(body.teacherId !== undefined ? { teacherId: body.teacherId } : {}),
        ...(body.dayOfWeek ? { dayOfWeek: body.dayOfWeek } : {}),
        ...(body.startMinute !== undefined ? { startMinute: body.startMinute } : {}),
        ...(body.endMinute !== undefined ? { endMinute: body.endMinute } : {}),
        ...(body.room !== undefined ? { room: body.room } : {}),
      },
    });
    await writeAudit(req, "timetable.update", "TimetableSlot", id);
    return slot;
  });
}
