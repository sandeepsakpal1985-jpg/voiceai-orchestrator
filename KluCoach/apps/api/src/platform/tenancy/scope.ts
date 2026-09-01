import { prisma } from "@klunex-edu/database";
import { notFound } from "../../lib/errors.js";

export function tenantWhere(institutionId: string) {
  return { institutionId };
}

export async function findTenantOr404<T>(
  loader: () => Promise<T | null>,
): Promise<T> {
  const row = await loader();
  if (!row) throw notFound();
  return row;
}

export async function studentInTenant(institutionId: string, studentId: string) {
  return findTenantOr404(() => prisma.student.findFirst({ where: { id: studentId, institutionId } }));
}

export async function teacherInTenant(institutionId: string, teacherId: string) {
  return findTenantOr404(() => prisma.teacher.findFirst({ where: { id: teacherId, institutionId } }));
}

export async function guardianInTenant(institutionId: string, guardianId: string) {
  return findTenantOr404(() => prisma.guardian.findFirst({ where: { id: guardianId, institutionId } }));
}

export async function branchInTenant(institutionId: string, branchId: string) {
  return findTenantOr404(() => prisma.branch.findFirst({ where: { id: branchId, institutionId } }));
}

export async function batchInTenant(institutionId: string, batchId: string) {
  return findTenantOr404(() => prisma.batch.findFirst({ where: { id: batchId, institutionId } }));
}

export async function programInTenant(institutionId: string, programId: string) {
  return findTenantOr404(() => prisma.program.findFirst({ where: { id: programId, institutionId } }));
}

export async function subjectInTenant(institutionId: string, subjectId: string) {
  return findTenantOr404(() => prisma.subject.findFirst({ where: { id: subjectId, institutionId } }));
}

export async function academicYearInTenant(institutionId: string, academicYearId: string) {
  return findTenantOr404(() => prisma.academicYear.findFirst({ where: { id: academicYearId, institutionId } }));
}

export async function assessmentInTenant(institutionId: string, assessmentId: string) {
  return findTenantOr404(() => prisma.assessment.findFirst({ where: { id: assessmentId, institutionId } }));
}

export async function assignmentInTenant(institutionId: string, assignmentId: string) {
  return findTenantOr404(() => prisma.assignment.findFirst({ where: { id: assignmentId, institutionId } }));
}

export async function noticeInTenant(institutionId: string, noticeId: string) {
  return findTenantOr404(() => prisma.notice.findFirst({ where: { id: noticeId, institutionId } }));
}
