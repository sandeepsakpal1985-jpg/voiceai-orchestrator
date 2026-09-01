# Testing

## Rules

- A skipped test is not a passing test.
- “Code exists” is not “feature works.”
- Cross-tenant tests must execute.

## Layers

| Layer | Tool | What |
|-------|------|------|
| Unit | Vitest | RBAC policies, spreadsheet parse, student-import validation, rate-limit config |
| Integration | Vitest + Postgres | auth, tenant isolation, invitation lifecycle, marks validation, teacher-batch denial, attendance upsert, timetable/assignment isolation, assignment submit-by-id |
| E2E | Playwright | parent invitation, assessment marks, attendance save + parent view, assignment submit, timetable admin slot, smoke/notice, parent Student 360, multi-child switch, student own 360 |
| Student 360 | Vitest | status engine unit tests; parent/student/teacher/admin authorization; Diya empty state; schema parse |

Phase 2 completion Playwright evidence (2026-09-01): **10/10 passed** — invitation activation, invalid token, assessment marks + parent result, attendance persist + parent view, assignment create/submit, timetable admin slot, plus smoke/notice.

Phase 2 Vitest evidence (2026-09-01): **48/48 passed** (previous 42 plus attendance upsert, timetable/session isolation, assignment submit isolation).

Phase 3 Vitest evidence (2026-09-01): **58/58 passed** (48 Phase 2 plus status engine and Student 360 authorization/empty-state integration).

Phase 3 Playwright evidence (2026-09-01): **13/13 passed** — Phase 2 ten workflows plus parent Student 360, multi-child switch + deny, student own 360.

## Cross-tenant matrix

Tenant A must not access Tenant B via:

- path IDs
- query params
- request bodies
- search
- reports / CSV export

Expected: **404**

## Commands

```bash
pnpm test
pnpm test:integration
pnpm --filter @klucoach/web test:e2e
```

Evidence belongs in [PROGRESS.md](./PROGRESS.md). If the environment cannot run a suite, mark **BLOCKED — ENVIRONMENT**.
