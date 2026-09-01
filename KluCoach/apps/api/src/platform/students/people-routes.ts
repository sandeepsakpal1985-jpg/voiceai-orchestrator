import type { FastifyInstance } from "fastify";
import { prisma } from "@klunex-edu/database";
import { studentCreateSchema, studentPatchSchema, teacherCreateSchema } from "@klunex-edu/shared";
import { writeAudit } from "../audit/write.js";
import { notFound, validationError } from "../../lib/errors.js";
import { requirePermission, requireTenant } from "../identity/http-auth.js";
import { parentStudentIds } from "../identity/scope.js";
import { batchInTenant, branchInTenant, studentInTenant, subjectInTenant, teacherInTenant } from "../tenancy/scope.js";

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
    const q = (req.query as { q?: string }).q;
    return prisma.student.findMany({
      where: {
        institutionId: tenant.institutionId,
        archivedAt: null,
        ...(q
          ? {
              OR: [
                { firstName: { contains: q, mode: "insensitive" } },
                { lastName: { contains: q, mode: "insensitive" } },
                { admissionNumber: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      include: { enrollments: { include: { batch: true } }, branch: true },
      orderBy: { firstName: "asc" },
      take: 200,
    });
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
    return prisma.guardian.findMany({
      where: { institutionId: tenant.institutionId },
      include: { students: { include: { student: true } }, user: true },
      take: 200,
      orderBy: { name: "asc" },
    });
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
    return prisma.teacher.findMany({
      where: { institutionId: tenant.institutionId },
      include: { batches: true, subjects: true, branches: true },
      orderBy: { name: "asc" },
    });
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
      include: { batches: true, subjects: true, branches: true },
    });
    if (!teacher) throw notFound();
    return teacher;
  });

  app.patch("/teachers/:id", async (req) => {
    const tenant = requireTenant(req);
    requirePermission(req, "teachers:write");
    const { id } = req.params as { id: string };
    await teacherInTenant(tenant.institutionId, id);
    const body = req.body as { name?: string; phone?: string; email?: string; status?: "ACTIVE" | "INACTIVE" };
    const teacher = await prisma.teacher.update({
      where: { id },
      data: {
        ...(body.name ? { name: body.name } : {}),
        ...(body.phone !== undefined ? { phone: body.phone } : {}),
        ...(body.email !== undefined ? { email: body.email } : {}),
        ...(body.status ? { status: body.status } : {}),
      },
    });
    await writeAudit(req, "teacher.update", "Teacher", id);
    return teacher;
  });
}
