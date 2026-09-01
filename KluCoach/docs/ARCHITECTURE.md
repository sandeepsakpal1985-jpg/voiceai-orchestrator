# KluNex Education Platform — Architecture

KluCoach is the first commercial product on the **KluNex Education Platform**.

The platform is the reusable core. KluCoach, KluSchool, and KluCollege are institution modes on that core — not separate codebases.

```
KluNex Education Platform
│
├── Core
│   ├── Identity
│   ├── Tenancy
│   ├── Students
│   ├── Parents / Guardians
│   ├── Teachers
│   ├── Academics (programs, subjects, batches, sessions)
│   ├── Attendance
│   ├── Assessments
│   ├── Communication
│   ├── Files
│   ├── Billing (plans, invoices — no full accounting)
│   └── Subscriptions
│
└── Institution Modes
    ├── Coaching   ← KluCoach (MVP)
    ├── School     ← KluSchool (future)
    └── College    ← KluCollege (future)
```

---

## 1. Product vs platform

| Name | What it is |
|------|------------|
| KluNex Education Platform | Internal reusable core: data model, auth, RBAC, tenant isolation, academic records |
| KluCoach | Commercial product for coaching institutes / tuition / academies |
| KluSchool / KluCollege | Future products enabled by `InstitutionType`, not forks |

MVP workflows are coaching-oriented (batches, JEE/NEET-style programs). The schema is not coaching-only: `Institution.type` and mode modules sit above the core.

---

## 2. Shape: modular monolith

One deployable API. One PostgreSQL database. One web app.

```
KluCoach/
  apps/api          Fastify — platform + KluCoach routes
  apps/web          React (Vite) — KluCoach UI
  packages/database Prisma schema + migrations + seed
  packages/shared   Enums, Zod contracts, error codes
  docs/
```

No microservices in MVP. No Kubernetes. Docker Compose for local/VPS.

---

## 3. Cost rule (₹500/student economics)

**No feature may create a significant variable cost per student unless there is a corresponding revenue reason.**

Allowed cheap defaults:

- PostgreSQL as system of record
- In-app notifications
- Email only when the institution has a configured provider
- Object storage for files (local disk in MVP; S3-compatible later)
- Efficient tenant-scoped queries; indexes on hot paths

Forbidden in MVP (and dangerous at ₹500/student/year):

- Per-request LLM/AI
- Video storage or live class infra
- Unbounded SMS/WhatsApp
- Per-student third-party SaaS seats

SMS/WhatsApp exist as **provider interfaces**, not default traffic.

---

## 4. Multi-tenancy

Every institution is a tenant (`Institution`).

Isolation layers:

1. **Session** — tenant comes from the authenticated session, never from the client body/query as authority
2. **Authorization** — RBAC + teacher-batch scope
3. **Service** — every query includes `institutionId` from session; write/filter IDs go through `*InTenant` (404 if missing)
4. **Database** — `institutionId` on every tenant-owned row; composite indexes
5. **Tests** — explicit cross-tenant denial tests (must execute). Phase 1 gate: [SECURITY_GATE_PHASE1.md](./SECURITY_GATE_PHASE1.md)

`SUPER_ADMIN` is the only role that may have a null institution (platform operator). All other users are institution-scoped.

Parents with multiple children: one `User` → many `StudentGuardian` rows, **same institution** in MVP. No cross-institution student portability.

---

## 5. Request path

```
Browser
  → React app (cookie: httpOnly session)
  → Fastify
      plugins: helmet, rate-limit, cookie, csrf, request-id
      authenticate → load session → bind TenantContext
      authorize(policy)
      Zod validate
      platform service (always session.institutionId)
      Prisma
  → PostgreSQL
```

Identity in the body (`institutionId`, `role`, `studentId` as “who I am”) is never trusted. Resource IDs are treated as untrusted handles and checked against session tenant + policy.

---

## 6. Domain map

| Core module | Owns |
|-------------|------|
| Identity | User, Session, Invitation, password hashing |
| Tenancy | Institution, Branch, InstitutionType |
| Students | Student profile, status, soft archive |
| Parents | Guardian, StudentGuardian, notification prefs |
| Teachers | Teacher, subject/branch/batch assignments |
| Academics | AcademicYear, Program, Subject, Batch, ClassSession, TimetableSlot |
| Attendance | AttendanceRecord |
| Assessments | Assessment, AssessmentResult |
| Assignments | Assignment, AssignmentSubmission |
| Communication | Notice, in-app Notification, provider ports |
| Files | FileObject metadata + storage port |
| Billing | FeePlan, FeeInvoice, Payment, Receipt (data model; no gateway in MVP) |
| Subscriptions | SubscriptionPlan, TenantSubscription, StudentEntitlement, partner share metrics |
| Audit | AuditLog |

KluCoach mode adds coaching-oriented labels and default workflows. It does not duplicate student/attendance tables.

---

## 7. AuthN / AuthZ

- Passwords: Argon2
- Sessions: server-side rows + httpOnly `Secure` `SameSite=Lax` cookie
- CSRF on cookie-authenticated mutations
- Central policy module (`apps/api/src/platform/identity/policies.ts`)
- Teacher access limited to assigned batches unless admin

See [ADR-001](./adr/ADR-001-multi-tenancy.md), [ADR-003](./adr/ADR-003-authentication.md).

---

## 8. Files and notifications

Ports, not vendors:

- `FileStorage` — local filesystem implementation in MVP
- `NotificationProvider` — `InAppProvider` + `EmailProvider` (console/log if SMTP unset)
- SMS/WhatsApp — interfaces only

See [ADR-005](./adr/ADR-005-file-storage.md), [ADR-006](./adr/ADR-006-notification-architecture.md).

---

## 9. Frontend

Organized by domain, not a giant `components/` dump.

```
apps/web/src/
  ui/           shadcn-style primitives (Button, Input, Table, …)
  klucoach/     product components (StudentStatusCard, DataTable usage)
  students/     queries + pages
  …
```

- Parent: mobile-first Student 360
- Admin: desktop-first, still responsive
- Student: simple academic home
- PWA-friendly: manifest, responsive, installable later
- Tables: one `DataTable` (TanStack Table v9) — do not invent ten grids
- List APIs: `?page=` returns `{ items, total, page, pageSize }`; omitting `page` still returns an array (test compatibility)
- Forms: React Hook Form + Zod from `@klunex-edu/shared`
- Server state: TanStack Query; **authorization stays on the API**
- Charts: Recharts only when a trend is real

See [OPEN_SOURCE.md](./OPEN_SOURCE.md) and [ADR-010](./adr/ADR-010-commodity-oss.md).

---

## 9.1 Import pipeline

```
UPLOAD → PARSE (Papa Parse / ExcelJS) → NORMALIZE → VALIDATE
  → PREVIEW → CONFIRM → TRANSACTION → RESULT
```

Parsers do not authorize. Tenant, batch resolution, duplicates, and error rows are KluCoach logic.

---

## 10. Deployment

VPS + Docker Compose: `web`, `api`, `postgres`. Reverse proxy/HTTPS documented in [DEPLOYMENT.md](./DEPLOYMENT.md). Architecture allows later move to managed Postgres/object storage without rewrite.

---

## 11. Scale posture

Design queries and indexes for 10k → 100k → 1M students **without a rewrite**. That means:

- tenant-first indexes
- no N+1 dashboard queries
- pagination on lists
- no chatty per-student microservice calls
- background jobs only when justified (import, email)

Caching is optional later (Redis). Not required for MVP.
