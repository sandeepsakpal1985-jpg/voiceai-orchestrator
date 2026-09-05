import { forbidden, notFound } from "../../lib/errors.js";
import type { AuthUser } from "../identity/http-auth.js";
import { assertParentOwnsStudent, studentSelfId } from "../identity/scope.js";
import { studentInTenant } from "../tenancy/scope.js";

/** Parents, the student, and institution admin. Teachers, staff, and super-admin do not inherit movement history. */
export async function assertMovementStudentAccess(user: AuthUser, studentId: string) {
  if (user.role === "SUPER_ADMIN" || user.role === "TEACHER" || user.role === "STAFF") throw forbidden();
  if (!user.institutionId) throw forbidden();
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
  throw forbidden();
}

export function assertMovementAdmin(user: AuthUser) {
  if (user.role === "SUPER_ADMIN") throw forbidden();
  if (user.role !== "INSTITUTION_ADMIN") throw forbidden();
}
