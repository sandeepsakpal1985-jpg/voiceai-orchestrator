import type { FastifyInstance } from "fastify";
import { prisma } from "@klunex-edu/database";
import { batchCreateSchema } from "@klunex-edu/shared";
import { writeAudit } from "../audit/write.js";
import { notFound, validationError } from "../../lib/errors.js";
import { requirePermission, requireTenant } from "../identity/http-auth.js";
import { parentStudentIds, studentSelfId } from "../identity/scope.js";
import {
  academicYearInTenant,
  batchInTenant,
  branchInTenant,
  programInTenant,
  studentInTenant,
  subjectInTenant,
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
    return prisma.batch.findMany({
      where: { institutionId: tenant.institutionId },
      include: { program: true, branch: true, _count: { select: { enrollments: true } } },
      orderBy: { name: "asc" },
    });
  });

  app.get("/batches/:id", async (req) => {
    const tenant = requireTenant(req);
    requirePermission(req, "batches:read");
    const { id } = req.params as { id: string };
    return batchInTenant(tenant.institutionId, id);
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
    const query = req.query as { batchId?: string; date?: string };
    if (query.batchId) await batchInTenant(tenant.institutionId, query.batchId);
    return prisma.classSession.findMany({
      where: {
        institutionId: tenant.institutionId,
        ...(query.batchId ? { batchId: query.batchId } : {}),
        ...(query.date ? { date: new Date(query.date) } : {}),
      },
      include: { subject: true, teacher: true, batch: true },
      orderBy: [{ date: "asc" }, { startMinute: "asc" }],
      take: 200,
    });
  });

  app.post("/sessions", async (req, reply) => {
    const tenant = requireTenant(req);
    requirePermission(req, "timetable:write");
    const body = req.body as {
      batchId: string;
      subjectId: string;
      teacherId?: string;
      date: string;
      startMinute: number;
      endMinute: number;
      room?: string;
    };
    await batchInTenant(tenant.institutionId, body.batchId);
    await subjectInTenant(tenant.institutionId, body.subjectId);
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
      },
    });
    return reply.code(201).send(session);
  });

  app.get("/timetable", async (req) => {
    const tenant = requireTenant(req);
    requirePermission(req, "timetable:read");
    const user = tenant;
    const query = req.query as { batchId?: string; studentId?: string };
    let batchIds: string[] | undefined;
    if (user.role === "PARENT") {
      const ids = await parentStudentIds(user);
      const enrolls = await prisma.batchEnrollment.findMany({ where: { studentId: { in: ids } } });
      batchIds = enrolls.map((e) => e.batchId);
    } else if (user.role === "STUDENT") {
      const sid = await studentSelfId(user);
      const enrolls = await prisma.batchEnrollment.findMany({ where: { studentId: sid } });
      batchIds = enrolls.map((e) => e.batchId);
    } else if (query.batchId) {
      await batchInTenant(tenant.institutionId, query.batchId);
      batchIds = [query.batchId];
    }
    return prisma.timetableSlot.findMany({
      where: {
        institutionId: tenant.institutionId,
        ...(batchIds ? { batchId: { in: batchIds } } : {}),
      },
      include: { subject: true, teacher: true, batch: true },
      orderBy: [{ dayOfWeek: "asc" }, { startMinute: "asc" }],
    });
  });

  app.post("/timetable", async (req, reply) => {
    const tenant = requireTenant(req);
    requirePermission(req, "timetable:write");
    const body = req.body as {
      batchId: string;
      subjectId: string;
      teacherId?: string;
      dayOfWeek: "MONDAY" | "TUESDAY" | "WEDNESDAY" | "THURSDAY" | "FRIDAY" | "SATURDAY" | "SUNDAY";
      startMinute: number;
      endMinute: number;
      room?: string;
    };
    await batchInTenant(tenant.institutionId, body.batchId);
    await subjectInTenant(tenant.institutionId, body.subjectId);
    const slot = await prisma.timetableSlot.create({
      data: {
        institutionId: tenant.institutionId,
        ...body,
      },
    });
    return reply.code(201).send(slot);
  });
}
