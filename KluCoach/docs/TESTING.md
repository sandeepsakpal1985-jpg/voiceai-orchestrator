# Testing

## Rules

- A skipped test is not a passing test.
- “Code exists” is not “feature works.”
- Cross-tenant tests must execute.

## Layers

| Layer | Tool | What |
|-------|------|------|
| Unit | Vitest | RBAC policies, Zod, attendance %, grade helpers |
| Integration | Vitest + Postgres | auth, tenant isolation, CRUD, import validation |
| E2E | Playwright | critical parent/teacher/admin workflows |

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
