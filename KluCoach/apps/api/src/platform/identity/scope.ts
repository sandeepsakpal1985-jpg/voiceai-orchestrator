import { prisma } from "@klunex-edu/database";
import { forbidden, notFound } from "../../lib/errors.js";
import type { AuthUser } from "../identity/http-auth.js";
import { batchInTenant } from "../tenancy/scope.js";

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
