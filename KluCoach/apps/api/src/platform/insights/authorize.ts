import { forbidden } from "../../lib/errors.js";
import type { AuthUser } from "../identity/http-auth.js";
import { assertStudent360Access } from "../identity/scope.js";

export async function assertInsightStudentAccess(user: AuthUser, studentId: string) {
  if (user.role === "SUPER_ADMIN") throw forbidden();
  return assertStudent360Access(user, studentId);
}

export function assertInsightAdmin(user: AuthUser) {
  if (user.role === "SUPER_ADMIN") throw forbidden();
  if (user.role !== "INSTITUTION_ADMIN") throw forbidden();
}
