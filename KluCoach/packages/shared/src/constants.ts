export const USER_ROLES = [
  "SUPER_ADMIN",
  "INSTITUTION_ADMIN",
  "TEACHER",
  "STAFF",
  "STUDENT",
  "PARENT",
] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const INSTITUTION_TYPES = [
  "COACHING",
  "SCHOOL",
  "COLLEGE",
  "UNIVERSITY",
  "OTHER",
] as const;
export type InstitutionType = (typeof INSTITUTION_TYPES)[number];

export const STUDENT_STATUSES = [
  "ACTIVE",
  "INACTIVE",
  "TRANSFERRED",
  "COMPLETED",
  "DROPPED",
  "SUSPENDED",
] as const;

export const ATTENDANCE_STATUSES = ["PRESENT", "ABSENT", "LATE", "EXCUSED"] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const ASSESSMENT_TYPES = ["TEST", "EXAM", "QUIZ", "MOCK_TEST", "ASSIGNMENT"] as const;
export const ASSIGNMENT_STATUSES = ["PENDING", "SUBMITTED", "LATE", "REVIEWED"] as const;
export const NOTICE_AUDIENCES = ["INSTITUTION", "BRANCH", "BATCH", "STUDENTS"] as const;
export const GUARDIAN_RELATIONSHIPS = ["MOTHER", "FATHER", "GUARDIAN", "OTHER"] as const;
export const DAYS_OF_WEEK = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
] as const;

export const SESSION_COOKIE = "klucoach.sid";
export const CSRF_COOKIE = "klucoach.csrf";
export const CSRF_HEADER = "x-csrf-token";

export const ERROR_CODES = {
  VALIDATION: "VALIDATION_ERROR",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  RATE_LIMIT: "RATE_LIMITED",
  INTERNAL: "INTERNAL_ERROR",
} as const;
