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
  const student = await prisma.student.findFirst({
    where: { id: studentId, institutionId },
  });
  if (!student) throw notFound();
  return student;
}
