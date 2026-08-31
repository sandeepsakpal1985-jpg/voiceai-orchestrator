import { z } from "zod";
import {
  ASSESSMENT_TYPES,
  ASSIGNMENT_STATUSES,
  ATTENDANCE_STATUSES,
  GUARDIAN_RELATIONSHIPS,
  INSTITUTION_TYPES,
  NOTICE_AUDIENCES,
  STUDENT_STATUSES,
} from "./constants.js";

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200),
});

export const registerInstitutionSchema = z.object({
  institutionName: z.string().min(2).max(200),
  city: z.string().min(1).max(120).optional(),
  state: z.string().min(1).max(120).optional(),
  type: z.enum(INSTITUTION_TYPES).default("COACHING"),
  adminFirstName: z.string().min(1).max(80),
  adminLastName: z.string().min(1).max(80),
  adminEmail: z.string().email(),
  password: z.string().min(10).max(200),
});

export const acceptInvitationSchema = z.object({
  token: z.string().min(16),
  password: z.string().min(10).max(200),
  firstName: z.string().min(1).max(80).optional(),
  lastName: z.string().min(1).max(80).optional(),
});

export const studentCreateSchema = z.object({
  branchId: z.string().min(1),
  academicYearId: z.string().optional(),
  admissionNumber: z.string().min(1).max(40),
  studentCode: z.string().max(40).optional(),
  firstName: z.string().min(1).max(80),
  middleName: z.string().max(80).optional(),
  lastName: z.string().min(1).max(80),
  preferredName: z.string().max(80).optional(),
  dateOfBirth: z.string().optional(),
  gender: z.enum(["MALE", "FEMALE", "OTHER", "UNSPECIFIED"]).optional(),
  email: z.string().email().optional(),
  phone: z.string().max(20).optional(),
  address: z.string().max(500).optional(),
  emergencyContactName: z.string().max(120).optional(),
  emergencyContactPhone: z.string().max(20).optional(),
  status: z.enum(STUDENT_STATUSES).optional(),
  admissionDate: z.string().optional(),
  batchId: z.string().optional(),
  guardians: z
    .array(
      z.object({
        name: z.string().min(1),
        relationship: z.enum(GUARDIAN_RELATIONSHIPS),
        phone: z.string().optional(),
        email: z.string().email().optional(),
        isPrimary: z.boolean().optional(),
      }),
    )
    .optional(),
});

export const studentPatchSchema = studentCreateSchema.partial();

export const batchCreateSchema = z.object({
  name: z.string().min(1).max(160),
  branchId: z.string().min(1),
  academicYearId: z.string().min(1),
  programId: z.string().min(1),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  capacity: z.number().int().positive().optional(),
  rankingEnabled: z.boolean().optional(),
  subjectIds: z.array(z.string()).optional(),
});

export const attendanceMarkSchema = z.object({
  classSessionId: z.string().optional(),
  batchId: z.string().min(1),
  date: z.string().min(8),
  records: z.array(
    z.object({
      studentId: z.string().min(1),
      status: z.enum(ATTENDANCE_STATUSES),
    }),
  ).min(1),
});

export const assessmentCreateSchema = z.object({
  name: z.string().min(1).max(160),
  subjectId: z.string().min(1),
  batchId: z.string().min(1),
  date: z.string().min(8),
  type: z.enum(ASSESSMENT_TYPES).optional(),
  maxMarks: z.number().positive(),
  passingMarks: z.number().nonnegative(),
});

export const resultsUpsertSchema = z.object({
  results: z.array(
    z.object({
      studentId: z.string().min(1),
      marks: z.number().nonnegative(),
      grade: z.string().max(8).optional(),
    }),
  ).min(1),
});

export const assignmentCreateSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  subjectId: z.string().min(1),
  batchId: z.string().min(1),
  dueAt: z.string().min(8),
});

export const assignmentStatusSchema = z.object({
  status: z.enum(ASSIGNMENT_STATUSES),
});

export const noticeCreateSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(8000),
  audience: z.enum(NOTICE_AUDIENCES).optional(),
  branchId: z.string().optional(),
  batchId: z.string().optional(),
  studentIds: z.array(z.string()).optional(),
});

export const invitationCreateSchema = z.object({
  type: z.enum(["PARENT", "STUDENT", "TEACHER", "STAFF", "INSTITUTION_ADMIN"]),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  studentId: z.string().optional(),
  guardianId: z.string().optional(),
  teacherId: z.string().optional(),
});

export const teacherCreateSchema = z.object({
  name: z.string().min(1).max(160),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  employeeId: z.string().optional(),
  branchIds: z.array(z.string()).optional(),
  batchIds: z.array(z.string()).optional(),
  subjectIds: z.array(z.string()).optional(),
});
