import { forbidden, notFound } from "../../lib/errors.js";
import type { AuthUser } from "../identity/http-auth.js";
import { assertParentOwnsStudent, studentSelfId, teacherAssignedBatchIds } from "../identity/scope.js";
import { batchInTenant, studentInTenant } from "../tenancy/scope.js";
import { prisma } from "@klunex-edu/database";

/** Super-admin does not inherit student AI from platform privileges. */
export function assertAiRoleAllowed(user: AuthUser, kind: "student" | "batch" | "institution") {
  if (user.role === "SUPER_ADMIN") throw forbidden();
  if (kind === "institution" && user.role !== "INSTITUTION_ADMIN") throw forbidden();
  if (kind === "batch" && user.role !== "TEACHER") throw forbidden();
  if (kind === "student" && !["PARENT", "STUDENT", "TEACHER", "INSTITUTION_ADMIN"].includes(user.role)) {
    throw forbidden();
  }
}

export async function assertAuthorizedAiStudent(user: AuthUser & { institutionId: string }, studentId: string) {
  assertAiRoleAllowed(user, "student");
  await studentInTenant(user.institutionId, studentId);
  if (user.role === "INSTITUTION_ADMIN") return;
  if (user.role === "PARENT") {
    await assertParentOwnsStudent(user, studentId);
    return;
  }
  if (user.role === "STUDENT") {
    const self = await studentSelfId(user);
    if (self !== studentId) throw notFound();
    return;
  }
  if (user.role === "TEACHER") {
    const batchIds = await teacherAssignedBatchIds(user);
    if (!batchIds.length) throw notFound();
    const enroll = await prisma.batchEnrollment.findFirst({
      where: { studentId, batchId: { in: batchIds } },
    });
    if (!enroll) throw notFound();
    return;
  }
  throw forbidden();
}

export async function assertAuthorizedAiBatch(user: AuthUser & { institutionId: string }, batchId: string) {
  assertAiRoleAllowed(user, "batch");
  await batchInTenant(user.institutionId, batchId);
  const assigned = await teacherAssignedBatchIds(user);
  if (!assigned.includes(batchId)) throw notFound();
}

export function audienceForStudentAsk(role: string): "parent" | "student" | "teacher" | "admin" {
  if (role === "PARENT") return "parent";
  if (role === "STUDENT") return "student";
  if (role === "TEACHER") return "teacher";
  return "admin";
}
