# Roadmap

Items here are **not** in the current build phase. Do not implement them because they are interesting.

---

## Phase 2 deferred

Do not interrupt Student 360 / parent experience for:

- Password reset
- PDF / XLSX export
- Teacher hard-delete
- Full Playwright suite expansion beyond proven workflows

Assignment submit-by-id is implemented (non-file path).

---

## Phase 3 — Student 360 + Parent Experience

Aggregation API, deterministic status, parent multi-child home, student own view. See [ADR-011](./adr/ADR-011-student-360-aggregation.md). Do not expand admin CRUD to finish this phase.

---

## Phase 4 — Communication / engagement

In-app notifications around Student 360 data. See [ADR-012](./adr/ADR-012-notification-engagement.md). Not a chat product.

Deferred from this phase (do not treat as implemented):

- Live SMTP/SMS/WhatsApp/push delivery
- Assignment due-soon / overdue job runner
- Fee due notifications
- Teacher notification dashboard
- Browser/mobile push

---

## Next major phase — Billing + subscription / partner economics

Secure multi-tenancy + academic workflows + Student 360 + parent engagement is enough product substance to design the ₹999/₹500/student commercial engine. Payment gateway can still come after plan/entitlement work.

---

## After that

- AI insights with tenant/role-respecting retrieval (only when cost model allows) — sits on Student 360, does not replace it
- SMS/WhatsApp providers (institution-paid usage)
- PDF reports
- Branch-level admin role
- Accountant / counsellor / principal roles
- PWA install + offline parent home
- Data-subject request workflow
- Redis cache if dashboards need it
- Cross-institution parent identity (explicit ADR required)

## Platform products

| Product | Mode | When |
|---------|------|------|
| KluCoach | `COACHING` | MVP |
| KluSchool | `SCHOOL` | After coaching MVP is validated |
| KluCollege | `COLLEGE` | After school mode patterns exist |
| KluUniversity | `UNIVERSITY` | Later |

School/college add workflows (sections, board exams, credit systems) **above** the core. They must not fork student/attendance/assessment tables.

## Explicit non-goals

Marketplace, advertising, behavioral ad profiles, live video classes, chat product, microservices split, Kubernetes.
