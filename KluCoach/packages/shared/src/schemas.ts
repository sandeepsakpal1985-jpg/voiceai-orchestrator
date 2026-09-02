import { z } from "zod";
import {
  ACADEMIC_ENTITY_STATUSES,
  ASSESSMENT_TYPES,
  ASSIGNMENT_STATUSES,
  ATTENDANCE_STATUSES,
  DAYS_OF_WEEK,
  GUARDIAN_RELATIONSHIPS,
  INSTITUTION_TYPES,
  NOTICE_AUDIENCES,
  NOTIFICATION_TYPES,
  STAFF_STATUSES,
  STUDENT_360_STATUSES,
  STUDENT_360_TRENDS,
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

export const batchPatchSchema = z.object({
  name: z.string().min(1).max(160).optional(),
  branchId: z.string().min(1).optional(),
  academicYearId: z.string().min(1).optional(),
  programId: z.string().min(1).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  capacity: z.number().int().positive().nullable().optional(),
  rankingEnabled: z.boolean().optional(),
  status: z.enum(ACADEMIC_ENTITY_STATUSES).optional(),
});

export const parentCreateSchema = z.object({
  name: z.string().min(1).max(160),
  email: z.string().email().optional(),
  phone: z.string().max(20).optional(),
  studentId: z.string().optional(),
  relationship: z.enum(GUARDIAN_RELATIONSHIPS).optional(),
  isPrimary: z.boolean().optional(),
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

export const assignmentPatchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).nullable().optional(),
  dueAt: z.string().min(8).optional(),
});

export const assignmentSubmitSchema = z.object({
  status: z.enum(["SUBMITTED"]).default("SUBMITTED"),
});

export const timetableCreateSchema = z.object({
  batchId: z.string().min(1),
  subjectId: z.string().min(1),
  teacherId: z.string().optional(),
  dayOfWeek: z.enum(DAYS_OF_WEEK),
  startMinute: z.number().int().min(0).max(24 * 60),
  endMinute: z.number().int().min(1).max(24 * 60),
  room: z.string().max(80).optional(),
});

export const timetablePatchSchema = timetableCreateSchema.partial();

export const sessionCreateSchema = z.object({
  batchId: z.string().min(1),
  subjectId: z.string().min(1),
  teacherId: z.string().optional(),
  date: z.string().min(8),
  startMinute: z.number().int().min(0).max(24 * 60),
  endMinute: z.number().int().min(1).max(24 * 60),
  room: z.string().max(80).optional(),
  status: z.enum(["SCHEDULED", "COMPLETED", "CANCELLED"]).optional(),
});

export const sessionPatchSchema = sessionCreateSchema.partial();

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

export const teacherPatchSchema = z.object({
  name: z.string().min(1).max(160).optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().max(20).nullable().optional(),
  employeeId: z.string().max(40).nullable().optional(),
  status: z.enum(STAFF_STATUSES).optional(),
});

export const student360Schema = z.object({
  student: z.object({
    id: z.string(),
    firstName: z.string(),
    lastName: z.string(),
    preferredName: z.string().nullable(),
    admissionNumber: z.string(),
    status: z.string(),
    photoUrl: z.string().nullable(),
    batch: z.string().nullable(),
    program: z.string().nullable(),
    branch: z.string(),
    academicYear: z.string().nullable(),
  }),
  summary: z.object({
    status: z.enum(STUDENT_360_STATUSES),
    statusLabel: z.string(),
    reasons: z.array(z.string()),
  }),
  overall: z.string(),
  attendance: z.object({
    percent: z.number().nullable(),
    present: z.number(),
    absent: z.number(),
    late: z.number(),
    excused: z.number(),
    recent: z.array(z.object({ date: z.string(), status: z.string() })),
    periodLabel: z.string(),
    trend: z.enum(STUDENT_360_TRENDS),
  }),
  academic: z.object({
    average: z.number().nullable(),
    latest: z.array(
      z.object({
        percentage: z.number(),
        marks: z.number(),
        maxMarks: z.number().nullable(),
        assessment: z.object({ name: z.string(), subject: z.object({ name: z.string() }) }),
      }),
    ),
    bySubject: z.array(z.object({ subject: z.string(), average: z.number(), count: z.number() })),
    trend: z.enum(STUDENT_360_TRENDS),
  }),
  upcoming: z.array(
    z.object({
      id: z.string(),
      date: z.string(),
      startMinute: z.number(),
      endMinute: z.number(),
      room: z.string().nullable(),
      subject: z.object({ name: z.string() }),
      teacher: z.object({ name: z.string() }).nullable(),
    }),
  ),
  assignments: z.object({
    pending: z.number(),
    overdue: z.number(),
    dueSoon: z.number(),
    submitted: z.number(),
    items: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        dueAt: z.string(),
        status: z.string(),
        subject: z.string(),
      }),
    ),
  }),
  notices: z.array(z.object({ id: z.string(), title: z.string(), publishedAt: z.string() })),
  fees: z
    .object({
      status: z.string(),
      pendingPaise: z.number(),
      dueDate: z.string().nullable(),
    })
    .nullable(),
  metadata: z.object({ generatedAt: z.string() }),
});
export type Student360 = z.infer<typeof student360Schema>;

export const notificationPreferenceSchema = z.object({
  attendanceAlerts: z.boolean(),
  resultAlerts: z.boolean(),
  assignmentAlerts: z.boolean(),
  noticeAlerts: z.boolean(),
  timetableAlerts: z.boolean(),
  feeAlerts: z.boolean(),
  channelInApp: z.boolean(),
  channelEmail: z.boolean(),
});
export const notificationPreferencePatchSchema = notificationPreferenceSchema.partial();
export type NotificationPreference = z.infer<typeof notificationPreferenceSchema>;

export const notificationItemSchema = z.object({
  id: z.string(),
  type: z.enum(NOTIFICATION_TYPES),
  title: z.string(),
  body: z.string(),
  href: z.string(),
  studentId: z.string().nullable(),
  studentName: z.string().nullable(),
  readAt: z.string().nullable(),
  createdAt: z.string(),
});
export type NotificationItem = z.infer<typeof notificationItemSchema>;
