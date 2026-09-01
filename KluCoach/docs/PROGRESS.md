# Progress

Updated: 2026-09-01

Validation rule: COMPLETE only with execution evidence.

| Feature | Status | Tests | Verified | Notes |
|---------|--------|-------|----------|-------|
| Repository audit (`1a585f7`) | VALIDATED | n/a | docs | See INITIAL_AUDIT.md; ai-sales-agent moves documented, history not rewritten |
| OSS strategy | IMPLEMENTED | n/a | docs | OPEN_SOURCE.md + ADR-010 |
| Architecture + ADRs | IMPLEMENTED | n/a | docs | Platform core vs KluCoach product |
| Privacy/security docs | IMPLEMENTED | n/a | docs | |
| Prisma schema + migration | VALIDATED | migrate applied | yes | `20260831174857_init` on local Postgres :55433 |
| Seed / demo tenant | VALIDATED | seed ran | yes | Demo Coaching Institute + Other Academy |
| Auth + sessions + Argon2 | VALIDATED | vitest | yes | Login 200/401 |
| Route-specific rate limits | VALIDATED | vitest isolation | yes | Test ceiling 10_000; no 429 in suite |
| Tenant isolation | VALIDATED | vitest integration | yes | Cross-tenant student/parent/attendance/results/search → 404 |
| RBAC | VALIDATED | vitest unit | yes | Policy matrix |
| Students table (DataTable v9) | IMPLEMENTED | Playwright not covering /students | no | Canonical table pattern |
| Login RHF + Zod | VALIDATED | Playwright | yes | Email / Password / Continue |
| Bulk import parse/validate | VALIDATED | vitest unit | yes | Papa Parse + ExcelJS; no silent skip |
| Parent dashboard | VALIDATED | Playwright | yes | Domain cards + optional attendance bars |
| Notices | VALIDATED | Playwright notice | yes | Teacher publish → parent sees |
| Production deployment | NOT STARTED | | | BLOCKED — no production host |

## Session summary (OSS audit)

1. **Completed:** Foundation audit of `1a585f7`; commodity OSS wired (tables, forms, query, parse port, helmet + route rate limits). Domain auth/tenancy unchanged.
2. **Validated:** Vitest 20/20; Playwright 4/4; API+web typecheck; web production build; lint no-op (no package lint scripts)
3. **Tests passed:** Vitest 20 (13 isolation/RBAC/parent + 7 import parse/validate); Playwright parent/admin/student/notice
4. **Tests blocked:** none for the suites that were run
5. **Security status:** Helmet + route-specific rate limits; session+Argon2+CSRF+tenant 404 unchanged
6. **Remaining work:** Remaining admin tables on DataTable; parent invitation E2E; marks entry E2E; HTTPS/backups
7. **Exact next step:** Parent invitation activation + assessment marks Playwright, then migrate Parents/Teachers/Batches/Attendance onto DataTable
