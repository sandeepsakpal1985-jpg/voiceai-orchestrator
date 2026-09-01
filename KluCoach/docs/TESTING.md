# Testing

## Rules

- A skipped test is not a passing test.
- “Code exists” is not “feature works.”
- Cross-tenant tests must execute.

## Layers

| Layer | Tool | What |
|-------|------|------|
| Unit | Vitest | RBAC policies, spreadsheet parse, student-import validation, rate-limit config |
| Integration | Vitest + Postgres | auth, tenant isolation, invitation lifecycle, marks validation, teacher-batch denial |
| E2E | Playwright | parent invitation activation, assessment marks, parent/teacher/admin smoke |

Phase 2 Playwright evidence (2026-09-01): **7/7 passed** — invitation activation, invalid token, assessment marks + parent result, plus existing smoke/notice.

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
