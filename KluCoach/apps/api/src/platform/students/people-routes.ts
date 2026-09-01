import type { FastifyInstance } from "fastify";
import { prisma } from "@klunex-edu/database";
import { parentCreateSchema, studentCreateSchema, studentPatchSchema, teacherCreateSchema, teacherPatchSchema } from "@klunex-edu/shared";
import { writeAudit } from "../audit/write.js";
import { listSkipTake, orderBy, parseListQuery, sendList } from "../../lib/listQuery.js";
import { notFound, validationError } from "../../lib/errors.js";
import { requirePermission, requireTenant } from "../identity/http-auth.js";
import { parentStudentIds, teacherAssignedBatchIds } from "../identity/scope.js";
import { batchInTenant, branchInTenant, guardianInTenant, studentInTenant, subjectInTenant, teacherInTenant } from "../tenancy/scope.js";

function parse<T>(schema: { safeParse: (v: unknown) => { success: true; data: T } | { success: false; error: { issues: { message: string }[] } } }, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) throw validationError(result.error.issues.map((i) => i.message).join("; "));
  return result.data;
}

export async function peopleRoutes(app: FastifyInstance) {
  app.get("/students", async (req) => {
    const user = requirePermission(req, "students:read");
    const tenant = requireTenant(req);
    if (user.role === "PARENT") {
      const ids = await parentStudentIds(user);
      return prisma.student.findMany({
        where: { institutionId: tenant.institutionId, id: { in: ids } },
        include: { enrollments: { include: { batch: true } }, guardians: { include: { guardian: true } } },
        orderBy: { firstName: "asc" },
      });
    }
    if (user.role === "STUDENT") {
      return prisma.student.findMany({
        where: { institutionId: tenant.institutionId, userId: user.id },
        include: { enrollments: { include: { batch: true } } },
      });
    }
    const list = parseListQuery((req.query ?? {}) as Record<string, unknown>);
    if (list.batchId) await batchInTenant(tenant.institutionId, list.batchId);
    if (list.branchId) await branchInTenant(tenant.institutionId, list.branchId);
    let teacherBatchIds: string[] | undefined;
    if (user.role === "TEACHER") {
      teacherBatchIds = await teacherAssignedBatchIds(user);
      if (list.batchId && !teacherBatchIds.includes(list.batchId)) throw notFound();
    }
    const where = {
      institutionId: tenant.institutionId,
      archivedAt: null,
      ...(list.status ? { status: list.status as "ACTIVE" } : {}),
      ...(list.branchId ? { branchId: list.branchId } : {}),
      ...(list.batchId || teacherBatchIds
        ? {
            enrollments: {
              some: {
                ...(list.batchId ? { batchId: list.batchId } : { batchId: { in: teacherBatchIds } }),
              },
            },
          }
        : {}),
      ...(list.q
        ? {
            OR: [
              { firstName: { contains: list.q, mode: "insensitive" as const } },
              { lastName: { contains: list.q, mode: "insensitive" as const } },
              { admissionNumber: { contains: list.q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };
    const { skip, take } = listSkipTake(list);
    const [items, total] = await Promise.all([
      prisma.student.findMany({
        where,
        include: { enrollments: { include: { batch: true } }, branch: true },
        orderBy: orderBy(list.sort, list.dir, ["firstName", "lastName", "admissionNumber", "status", "createdAt"] as const, "firstName"),
        skip,
        take,
      }),
      prisma.student.count({ where }),
    ]);
    return sendList(list, items, total);
  });

  app.post("/students", async (req, reply) => {
    const tenant = requireTenant(req);
    requirePermission(req, "students:write");
    const body = parse(studentCreateSchema, req.body);
    await branchInTenant(tenant.institutionId, body.branchId);
    if (body.batchId) await batchInTenant(tenant.institutionId, body.batchId);
    const student = await prisma.$transaction(async (tx) => {
      const created = await tx.student.create({
        data: {
          institutionId: tenant.institutionId,
          branchId: body.branchId,
          academicYearId: body.academicYearId,
          admissionNumber: body.admissionNumber,
          studentCode: body.studentCode,
          firstName: body.firstName,
          middleName: body.middleName,
          lastName: body.lastName,
          preferredName: body.preferredName,
          dateOfBirth: body.dateOfBirth ? new Date(body.dateOfBirth) : undefined,
          gender: body.gender ?? "UNSPECIFIED",
          email: body.email,
          phone: body.phone,
          address: body.address,
          emergencyContactName: body.emergencyContactName,
          emergencyContactPhone: body.emergencyContactPhone,
          status: body.status ?? "ACTIVE",
          admissionDate: body.admissionDate ? new Date(body.admissionDate) : undefined,
        },
      });
      if (body.batchId) {
        await tx.batchEnrollment.create({
          data: { batchId: body.batchId, studentId: created.id },
        });
      }
      for (const g of body.guardians ?? []) {
        const guardian = await tx.guardian.create({
          data: {
            institutionId: tenant.institutionId,
            name: g.name,
            phone: g.phone,
            email: g.email,
          },
        });
        await tx.studentGuardian.create({
          data: {
            studentId: created.id,
            guardianId: guardian.id,
            relationship: g.relationship,
            isPrimary: g.isPrimary ?? false,
          },
        });
      }
      return created;
    });
    await writeAudit(req, "student.create", "Student", student.id);
    return reply.code(201).send(student);
  });

  app.get("/students/:id", async (req) => {
    const tenant = requireTenant(req);
    const user = requirePermission(req, "students:read");
    const { id } = req.params as { id: string };
    if (user.role === "PARENT") {
      const ids = await parentStudentIds(user);
      if (!ids.includes(id)) throw notFound();
    }
    if (user.role === "STUDENT") {
      const self = await prisma.student.findFirst({ where: { userId: user.id, institutionId: tenant.institutionId } });
      if (self?.id !== id) throw notFound();
    }
    const student = await prisma.student.findFirst({
      where: { id, institutionId: tenant.institutionId },
      include: {
        enrollments: { include: { batch: true } },
        guardians: { include: { guardian: true } },
        branch: true,
      },
    });
    if (!student) throw notFound();
    return student;
  });

  app.patch("/students/:id", async (req) => {
    const tenant = requireTenant(req);
    requirePermission(req, "students:write");
    const { id } = req.params as { id: string };
    await studentInTenant(tenant.institutionId, id);
    const body = parse(studentPatchSchema, req.body);
    const student = await prisma.student.update({
      where: { id },
      data: {
        ...("firstName" in body ? { firstName: body.firstName } : {}),
        ...("lastName" in body ? { lastName: body.lastName } : {}),
        ...("status" in body ? { status: body.status } : {}),
        ...("phone" in body ? { phone: body.phone } : {}),
        ...("email" in body ? { email: body.email } : {}),
        ...("preferredName" in body ? { preferredName: body.preferredName } : {}),
        ...("address" in body ? { address: body.address } : {}),
      },
    });
    await writeAudit(req, "student.update", "Student", id);
    return student;
  });

  app.get("/parents", async (req) => {
    const tenant = requireTenant(req);
    requirePermission(req, "parents:read");
    const list = parseListQuery((req.query ?? {}) as Record<string, unknown>);
    const where = {
      institutionId: tenant.institutionId,
      ...(list.q
        ? {
            OR: [
              { name: { contains: list.q, mode: "insensitive" as const } },
              { email: { contains: list.q, mode: "insensitive" as const } },
              { phone: { contains: list.q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };
    const { skip, take } = listSkipTake(list);
    const [items, total] = await Promise.all([
      prisma.guardian.findMany({
        where,
        include: {
          students: { include: { student: { select: { id: true, firstName: true, lastName: true, admissionNumber: true } } } },
          user: { select: { id: true, email: true, status: true } },
          invitations: { orderBy: { createdAt: "desc" }, take: 3, select: { id: true, acceptedAt: true, expiresAt: true, email: true, createdAt: true } },
        },
        orderBy: orderBy(list.sort, list.dir, ["name", "email", "createdAt"] as const, "name"),
        skip,
        take,
      }),
      prisma.guardian.count({ where }),
    ]);
    return sendList(list, items, total);
  });

  app.post("/parents", async (req, reply) => {
    const tenant = requireTenant(req);
    requirePermission(req, "parents:write");
    const body = parse(parentCreateSchema, req.body);
    if (body.studentId) await studentInTenant(tenant.institutionId, body.studentId);
    const guardian = await prisma.$transaction(async (tx) => {
      const created = await tx.guardian.create({
        data: {
          institutionId: tenant.institutionId,
          name: body.name,
          email: body.email?.toLowerCase(),
          phone: body.phone,
        },
      });
      if (body.studentId) {
        await tx.studentGuardian.create({
          data: {
            studentId: body.studentId,
            guardianId: created.id,
            relationship: body.relationship ?? "GUARDIAN",
            isPrimary: body.isPrimary ?? false,
          },
        });
      }
      return created;
    });
    await writeAudit(req, "parent.create", "Guardian", guardian.id);
    return reply.code(201).send(guardian);
  });

  app.post("/parents/:id/children", async (req, reply) => {
    const tenant = requireTenant(req);
    requirePermission(req, "parents:write");
    const { id } = req.params as { id: string };
    await guardianInTenant(tenant.institutionId, id);
    const body = req.body as { studentId?: string; relationship?: "MOTHER" | "FATHER" | "GUARDIAN" | "OTHER"; isPrimary?: boolean };
    if (!body.studentId) throw validationError("studentId required");
    await studentInTenant(tenant.institutionId, body.studentId);
    const relationship = body.relationship ?? "GUARDIAN";
    const link = await prisma.studentGuardian.upsert({
      where: { studentId_guardianId: { studentId: body.studentId, guardianId: id } },
      update: { relationship, isPrimary: body.isPrimary ?? false },
      create: {
        studentId: body.studentId,
        guardianId: id,
        relationship,
        isPrimary: body.isPrimary ?? false,
      },
    });
    await writeAudit(req, "parent.link", "StudentGuardian", link.id);
    return reply.code(201).send(link);
  });

  app.get("/parents/:id", async (req) => {
    const tenant = requireTenant(req);
    requirePermission(req, "parents:read");
    const { id } = req.params as { id: string };
    const guardian = await prisma.guardian.findFirst({
      where: { id, institutionId: tenant.institutionId },
      include: { students: { include: { student: true } }, user: true },
    });
    if (!guardian) throw notFound();
    return guardian;
  });

  app.get("/teachers", async (req) => {
    const tenant = requireTenant(req);
    requirePermission(req, "teachers:read");
    const list = parseListQuery((req.query ?? {}) as Record<string, unknown>);
    const where = {
      institutionId: tenant.institutionId,
      ...(list.status ? { status: list.status as "ACTIVE" } : {}),
      ...(list.q
        ? {
            OR: [
              { name: { contains: list.q, mode: "insensitive" as const } },
              { email: { contains: list.q, mode: "insensitive" as const } },
              { employeeId: { contains: list.q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };
    const { skip, take } = listSkipTake(list);
    const [items, total] = await Promise.all([
      prisma.teacher.findMany({
        where,
        include: {
          batches: { include: { batch: { select: { id: true, name: true } } } },
          subjects: { include: { subject: { select: { id: true, name: true } } } },
          branches: { include: { branch: { select: { id: true, name: true } } } },
        },
        orderBy: orderBy(list.sort, list.dir, ["name", "employeeId", "status", "createdAt"] as const, "name"),
        skip,
        take,
      }),
      prisma.teacher.count({ where }),
    ]);
    return sendList(list, items, total);
  });

  app.post("/teachers", async (req, reply) => {
    const tenant = requireTenant(req);
    requirePermission(req, "teachers:write");
    const body = parse(teacherCreateSchema, req.body);
    for (const branchId of body.branchIds ?? []) await branchInTenant(tenant.institutionId, branchId);
    for (const batchId of body.batchIds ?? []) await batchInTenant(tenant.institutionId, batchId);
    for (const subjectId of body.subjectIds ?? []) await subjectInTenant(tenant.institutionId, subjectId);
    const teacher = await prisma.teacher.create({
      data: {
        institutionId: tenant.institutionId,
        name: body.name,
        email: body.email,
        phone: body.phone,
        employeeId: body.employeeId,
        branches: body.branchIds ? { create: body.branchIds.map((branchId) => ({ branchId })) } : undefined,
        batches: body.batchIds ? { create: body.batchIds.map((batchId) => ({ batchId })) } : undefined,
        subjects: body.subjectIds ? { create: body.subjectIds.map((subjectId) => ({ subjectId })) } : undefined,
      },
    });
    await writeAudit(req, "teacher.create", "Teacher", teacher.id);
    return reply.code(201).send(teacher);
  });

  app.get("/teachers/:id", async (req) => {
    const tenant = requireTenant(req);
    requirePermission(req, "teachers:read");
    const { id } = req.params as { id: string };
    const teacher = await prisma.teacher.findFirst({
      where: { id, institutionId: tenant.institutionId },
      include: {
        batches: { include: { batch: { select: { id: true, name: true } } } },
        subjects: { include: { subject: { select: { id: true, name: true } } } },
        branches: { include: { branch: { select: { id: true, name: true } } } },
      },
    });
    if (!teacher) throw notFound();
    return teacher;
  });

  app.patch("/teachers/:id", async (req) => {
    const tenant = requireTenant(req);
    requirePermission(req, "teachers:write");
    const { id } = req.params as { id: string };
    await teacherInTenant(tenant.institutionId, id);
    const body = parse(teacherPatchSchema, req.body);
    const teacher = await prisma.teacher.update({
      where: { id },
      data: {
        ...(body.name ? { name: body.name } : {}),
        ...(body.phone !== undefined ? { phone: body.phone } : {}),
        ...(body.email !== undefined ? { email: body.email } : {}),
        ...(body.employeeId !== undefined ? { employeeId: body.employeeId } : {}),
        ...(body.status ? { status: body.status } : {}),
      },
    });
    await writeAudit(req, "teacher.update", "Teacher", id);
    return teacher;
  });

  app.get("/invitations", async (req) => {
    const tenant = requireTenant(req);
    requirePermission(req, "parents:read");
    const list = parseListQuery((req.query ?? {}) as Record<string, unknown>);
    const query = req.query as { studentId?: string; guardianId?: string };
    if (query.studentId) await studentInTenant(tenant.institutionId, query.studentId);
    if (query.guardianId) await guardianInTenant(tenant.institutionId, query.guardianId);
    const where = {
      institutionId: tenant.institutionId,
      ...(query.studentId ? { studentId: query.studentId } : {}),
      ...(query.guardianId ? { guardianId: query.guardianId } : {}),
    };
    const { skip, take } = listSkipTake(list);
    const [items, total] = await Promise.all([
      prisma.invitation.findMany({
        where,
        select: {
          id: true,
          type: true,
          email: true,
          acceptedAt: true,
          expiresAt: true,
          createdAt: true,
          studentId: true,
          guardianId: true,
          student: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      prisma.invitation.count({ where }),
    ]);
    return sendList(list, items, total);
  });
}
