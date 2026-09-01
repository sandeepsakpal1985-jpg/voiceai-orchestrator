# Roadmap

Items here are **not** in the current build phase. Do not implement them because they are interesting.

---

## Phase 2 deferred

Do not interrupt core education workflows for:

- Password reset
- PDF / XLSX export
- Assignment submit-by-id
- Teacher hard-delete
- Full Playwright suite beyond the two critical workflows

---

## After MVP (KluCoach)

- Performance trends, improvement score, risk indicators
- AI insights with tenant/role-respecting retrieval (only when cost model allows)
- Payment gateway + receipts as first-class money movement
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
