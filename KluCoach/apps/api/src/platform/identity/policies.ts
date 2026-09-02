import type { UserRole } from "@klunex-edu/shared";

export const PERMISSIONS = [
  "students:read",
  "students:write",
  "parents:read",
  "parents:write",
  "teachers:read",
  "teachers:write",
  "batches:read",
  "batches:write",
  "attendance:read",
  "attendance:write",
  "assessments:read",
  "assessments:write",
  "assignments:read",
  "assignments:write",
  "notices:read",
  "notices:write",
  "timetable:read",
  "timetable:write",
  "fees:read",
  "fees:write",
  "billing:read",
  "billing:write",
  "reports:read",
  "import:write",
  "invitations:write",
  "search:read",
  "dashboard:admin",
  "dashboard:parent",
  "dashboard:student",
  "institution:write",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ALL: Permission[] = [...PERMISSIONS];

const MATRIX: Record<UserRole, Permission[]> = {
  SUPER_ADMIN: ALL,
  INSTITUTION_ADMIN: ALL.filter(
    (p) => p !== "dashboard:parent" && p !== "dashboard:student" && p !== "billing:write",
  ),
  TEACHER: [
    "students:read",
    "parents:read",
    "teachers:read",
    "batches:read",
    "attendance:read",
    "attendance:write",
    "assessments:read",
    "assessments:write",
    "assignments:read",
    "assignments:write",
    "notices:read",
    "notices:write",
    "timetable:read",
    "timetable:write",
    "search:read",
  ],
  STAFF: [
    "students:read",
    "students:write",
    "parents:read",
    "parents:write",
    "teachers:read",
    "batches:read",
    "attendance:read",
    "attendance:write",
    "assessments:read",
    "notices:read",
    "notices:write",
    "timetable:read",
    "search:read",
    "invitations:write",
  ],
  STUDENT: [
    "dashboard:student",
    "students:read",
    "timetable:read",
    "attendance:read",
    "assessments:read",
    "assignments:read",
    "assignments:write",
    "notices:read",
  ],
  PARENT: [
    "dashboard:parent",
    "students:read",
    "timetable:read",
    "attendance:read",
    "assessments:read",
    "assignments:read",
    "notices:read",
    "fees:read",
  ],
};

export function can(role: UserRole, permission: Permission): boolean {
  return MATRIX[role]?.includes(permission) ?? false;
}

export function permissionsFor(role: UserRole): Permission[] {
  return MATRIX[role] ?? [];
}
