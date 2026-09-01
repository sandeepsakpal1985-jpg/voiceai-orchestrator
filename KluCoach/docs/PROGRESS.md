# Progress

Updated: 2026-09-01 (Phase 2 — core education workflows)

Validation rule: COMPLETE only with execution evidence.

| Feature | Status | Tests | Verified | Notes |
|---------|--------|-------|----------|-------|
| Locked foundation `47d1989` | VALIDATED | n/a | git | Not rebuilt |
| Phase 1 security gate `70a9ecc` | VALIDATED | vitest 35 | yes | Permanent regression |
| Parent invitation E2E | VALIDATED | playwright | yes | Admin → invite → activate → child |
| Parent activation | VALIDATED | playwright | yes | Token shown in UI; not logged |
| Parent sees correct child | VALIDATED | playwright | yes | Seeded unique student |
| Cross-tenant parent access | VALIDATED | playwright + vitest | yes | Foreign studentId → 404 |
| Invitation reuse / expiry / invalid | VALIDATED | vitest + playwright | yes | 401; accept 401 no longer bounces to login |
| Assessment creation | VALIDATED | playwright | yes | Teacher, JEE batch, Physics |
| Marks entry | VALIDATED | playwright | yes | Aarav 91 |
| Invalid marks rejected | VALIDATED | playwright + vitest | yes | 101 and negative |
| Parent sees result | VALIDATED | playwright | yes | Name + 91% |
| Cross-tenant assessment access | VALIDATED | vitest | yes | 404 on foreign assessment/results |
| Shared DataTable | VALIDATED | playwright students + vitest pages | yes | One `DataTable`; server page/search/sort |
| Parents table | VALIDATED | vitest paged isolation | yes | Shared DataTable |
| Teachers table | VALIDATED | vitest paged isolation | yes | Shared DataTable; no hard-delete |
| Batches table | VALIDATED | vitest paged isolation | yes | Shared DataTable; FK checks |
| Students table | VALIDATED | playwright create + vitest | yes | Shared DataTable; Student 360 route |
| Attendance workflow | VALIDATED | vitest teacher 403 | yes | Batch roster from API; teacher assigned batches only |
| Teacher batch authorization | VALIDATED | vitest | yes | Unassigned batch → 403 on write; omitted from GET /batches |
| Tenant isolation regression | VALIDATED | vitest 42/42 | yes | Previous 35 plus workflow cases |
| Password reset | NOT STARTED | | | Backlog |
| PDF/XLSX export | NOT STARTED | | | Backlog |
| Playwright admin create-branch | NOT STARTED | | | Deferred |
| Production deployment | NOT STARTED | | | BLOCKED — no production host |

## Session summary (Phase 2)

1. **Starting commit:** `70a9ecc`
2. **Parent invitation:** Playwright executed and passed
3. **Assessment/marks:** Playwright executed and passed
4. **DataTable:** one TanStack Table v9 wrapper used by Students, Parents, Teachers, Batches
5. **Tests executed:** Vitest 42/42; Playwright 7/7
6. **Tests blocked:** none
7. **Exact next step:** Timetable and assignments screens on the same DataTable pattern; do not start password reset or PDF export
