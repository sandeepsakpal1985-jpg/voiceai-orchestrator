# KluCoach — Product

**Positioning:** Student 360 for coaching institutes.

Not “another school ERP.” The institution should be able to say:

> Parents can see everything important about their child's coaching journey in one place.

---

## Promise

Parents understand the child's status in about ten seconds:

- attendance
- latest marks
- upcoming test / class
- pending assignments
- recent notices
- fee status when enabled

---

## Commercial model (configurable — never hard-code)

B2B2C. Institution is the buyer and distributor.

| List | Approx. reference |
|------|-------------------|
| Direct / public | ₹1,999 / student / year |
| Institution partner | ₹999 / student / year |
| KluNex target realization | ~₹500 / student / year |
| Institution margin (partner) | ~₹500 / student / year |

These are **commercial assumptions**. Actual amounts live on `SubscriptionPlan` and tenant agreements.

**SafeTrack (planning, not 9A checkout):** RFID add-on list about ₹1,299–₹1,499/student/year and GPS about ₹1,999–₹2,499/student/year plus device hardware are **not** encoded as live plans in this phase. Hardware and SIM costs must be quoted from Indian OEM/ODMs before locking prices. See [BILLING.md](./BILLING.md) and [ADR-020](./adr/ADR-020-student-movement-safetrack.md).

Institutions acquire students and parents. Optimize for:

- easy onboarding
- bulk import
- simple parent activation
- low admin effort
- high parent engagement
- annual subscriptions
- multi-tenancy and privacy

---

## Users

| Role | Primary job |
|------|-------------|
| SUPER_ADMIN | Platform operator |
| INSTITUTION_ADMIN | Run the institute |
| TEACHER | Attendance, marks, assignments, notices (scoped) |
| STAFF | Operational help, limited write |
| STUDENT | Own timetable, results, assignments |
| PARENT | Student 360 for linked children |

---

## MVP must

Authentication, multi-tenancy, RBAC, institutions, branches, students, parents, teachers, courses, batches, subjects, class sessions, attendance, timetable, assessments, results, notices, three dashboards, bulk import, parent invitations, audit logging, basic reports.

## MVP must not

AI assistant, payment gateway, advanced accounting, CRM, chat, video, live classes, marketplace, ads, behavioral profiling, cross-institution portability, microservices.

---

## Institution types

`COACHING` is the only active mode in MVP. Schema also allows `SCHOOL`, `COLLEGE`, `UNIVERSITY`, `OTHER` so KluSchool/KluCollege do not require a database rewrite.
