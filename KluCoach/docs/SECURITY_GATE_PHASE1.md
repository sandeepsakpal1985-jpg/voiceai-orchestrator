# Phase 1 security gate

Checkpoint: `47d1989` (locked foundation). Isolation policy remains **404**. Tests below executed on 2026-09-01 against local Postgres `:55433`.

| Area | Status | Tests | Evidence | Notes |
| ---- | ------ | ----- | -------- | ----- |
| student | PASS | isolation.integration.test.ts | executed | GET `/students/:id` cross-tenant → 404 |
| parent | PASS | isolation + boundary | executed | Parent GET child + GET `/parents/:id` |
| attendance | PASS | isolation + batchId 404 | executed | `studentId` and `batchId` query params |
| results | PASS | isolation | executed | `studentId` / `assessmentId` scoped |
| search | PASS | isolation + teacher employee id | executed | No Tenant B strings |
| teacher | PASS | boundary.integration.test.ts | executed | GET/PATCH `/teachers/:id`, POST with foreign batchIds, search `T-2001` |
| assignment | PASS | boundary | executed | GET `/assignments/:id`, `?batchId=`, POST on foreign batch |
| notice | PASS | boundary | executed | GET `/notices/:id`; POST targeting foreign student/batch |
| report | PASS | boundary CSV | executed | `/reports/students.csv`, attendance, parent-activation |
| export | PASS | same CSV pathways | executed | CSV body must not contain `O-1001`, `Pune Camp`, Tenant B parent phone |
| invitation tenant isolation | PASS | boundary | executed | POST `/invitations` with Tenant B `studentId` → 404 |
| authentication throttling | PASS | config + identical 401 | executed | Production: login 10/min, register 5/min, invite accept 10/min, invite create 20/min. Vitest uses 10_000 so isolation does not 429. Live 429 not exercised in Vitest. |
| tenant-scoped query paths | PASS | write-path helpers | executed | See query findings below |
| route ID isolation | PASS | GET by id suite | executed | branches, programs, subjects, batches, parents, teachers, assignments, notices |
| query/filter isolation | PASS | batchId / studentId | executed | Foreign IDs 404, not empty lists |
| password reset | NOT IMPLEMENTED | — | — | No reset endpoints |
| assignment submit-by-id | NOT IMPLEMENTED | — | — | Create + list exist; no student submit route yet |
| teacher hard-delete | NOT IMPLEMENTED | — | — | PATCH status only |
| PDF / XLSX export | NOT IMPLEMENTED | — | — | CSV only |

**SECURITY GATE: PASS**

Applicable implemented tests executed and passed: Vitest **35/35**.

---

## Query tenant-scope findings

| Kind | Examples | Rule |
|------|----------|------|
| GLOBAL | `SubscriptionPlan`, unscoped `SUPER_ADMIN` user | Do not add `institutionId` |
| TENANT-OWNED | Institution (the tenant), Branch, Student, Teacher, Guardian, Batch, Program, Subject, Assignment, Notice, ImportJob | Always `institutionId` from session |
| RELATIONALLY TENANT-OWNED | BatchEnrollment, TeacherBatch, NoticeStudent, AssignmentSubmission | Resolve parent in-tenant first |

**Fixed this phase (would have leaked or attached foreign FKs):**

1. `assertTeacherBatchAccess` skipped batch ownership for admins — Tenant A admin could write attendance/assignments onto a Tenant B `batchId`.
2. POST student/teacher/batch/notice/session/timetable accepted foreign branch/batch/subject/student IDs.
3. POST `/invitations` accepted Tenant B `studentId` / `guardianId` / `teacherId`.
4. GET filters (`assignments?batchId=`, `attendance?batchId=`, `fees?studentId=`) returned empty instead of 404.

`findUnique({ where: { id } })` after `*InTenant` is used only for updates of rows already proven in-tenant.

---

## Authentication / invitation

- Login failures return a single message: `Invalid email or password` (unknown vs known email). Failed-login audit no longer stores the email or user id.
- Invitation tokens: 32-byte `base64url`, SHA-256 stored, 14-day expiry, `acceptedAt` single-use. Accept re-checks related rows belong to `invite.institutionId`. Token is returned to the inviter (needed to send the link) and is not written to audit metadata.
- Password reset: **NOT IMPLEMENTED**.
