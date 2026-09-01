import { prisma } from "@klunex-edu/database";
import { forbidden, notFound } from "../../lib/errors.js";
import type { AuthUser } from "../identity/http-auth.js";
import { batchInTenant, studentInTenant } from "../tenancy/scope.js";

export async function assertTeacherBatchAccess(user: AuthUser, batchId: string) {
  if (!user.institutionId) throw forbidden();
  await batchInTenant(user.institutionId, batchId);
  if (user.role === "INSTITUTION_ADMIN" || user.role === "STAFF" || user.role === "SUPER_ADMIN") {
    return;
  }
  if (user.role !== "TEACHER") throw forbidden();
  const teacher = await prisma.teacher.findFirst({
    where: { userId: user.id, institutionId: user.institutionId },
  });
  if (!teacher) throw forbidden();
  const link = await prisma.teacherBatch.findUnique({
    where: { teacherId_batchId: { teacherId: teacher.id, batchId } },
  });
  if (!link) throw forbidden();
}

export async function parentStudentIds(user: AuthUser): Promise<string[]> {
  if (!user.institutionId) return [];
  const guardian = await prisma.guardian.findFirst({
    where: { userId: user.id, institutionId: user.institutionId },
    include: { students: true },
  });
  return guardian?.students.map((s) => s.studentId) ?? [];
}

export async function assertParentOwnsStudent(user: AuthUser, studentId: string) {
  const ids = await parentStudentIds(user);
  if (!ids.includes(studentId)) throw notFound();
}

export async function studentSelfId(user: AuthUser): Promise<string> {
  const student = await prisma.student.findFirst({
    where: { userId: user.id, institutionId: user.institutionId ?? undefined },
  });
  if (!student) throw notFound();
  return student.id;
}

export async function teacherAssignedBatchIds(user: AuthUser): Promise<string[]> {
  if (!user.institutionId) return [];
  const teacher = await prisma.teacher.findFirst({
    where: { userId: user.id, institutionId: user.institutionId },
    select: { id: true },
  });
  if (!teacher) return [];
  const links = await prisma.teacherBatch.findMany({
    where: { teacherId: teacher.id },
    select: { batchId: true },
  });
  return links.map((l) => l.batchId);
}

export async function assertStudent360Access(user: AuthUser, studentId: string) {
  if (!user.institutionId) throw forbidden();
  const student = await studentInTenant(user.institutionId, studentId);
  if (user.role === "SUPER_ADMIN" || user.role === "INSTITUTION_ADMIN" || user.role === "STAFF") {
    return student;
  }
  if (user.role === "PARENT") {
    await assertParentOwnsStudent(user, studentId);
    return student;
  }
  if (user.role === "STUDENT") {
    const self = await studentSelfId(user);
    if (self !== studentId) throw notFound();
    return student;
  }
  if (user.role === "TEACHER") {
    const batchIds = await teacherAssignedBatchIds(user);
    if (!batchIds.length) throw notFound();
    const enroll = await prisma.batchEnrollment.findFirst({
      where: { studentId, batchId: { in: batchIds } },
    });
    if (!enroll) throw notFound();
    return student;
  }
  throw forbidden();
}
