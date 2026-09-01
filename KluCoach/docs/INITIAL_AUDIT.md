# KluCoach — Foundation audit (commit `1a585f7`)

**Date:** 2026-09-01  
**Checkpoint:** `1a585f7` on `master`  
**Scope:** Audit existing KluCoach; establish OSS strategy. Do not rebuild the foundation.

The original greenfield audit (empty directory) is superseded by this review.

---

## Git state

| Item | Finding |
|------|---------|
| Checkpoint | `1a585f7` — `feat: initialize KluCoach on the KluNex Education Platform core` |
| KluCoach files | 96 paths added (app, schema, docs, tests, lockfile) |
| Unrelated files | 10 `ai-sales-agent` documentation **renames** into `archive/documentation/` |
| History rewrite | **Not done.** Leave `1a585f7` intact. |

### `ai-sales-agent` (unrelated, keep)

These were already staged in the parent repo and were included accidentally in the same commit:

- `ai-sales-agent/archive/documentation/DEPLOYMENT_READINESS_REPORT.md`
- `PROGRESS.md`, `PROJECT_STATE.md`, `PROJECT_STATUS.md`
- `bottleneck_analysis.md`, `first_live_call.md`, `latency_report.md`
- `microsip_internal_test.md`, `migration_report.md`, `production_readiness_report.md`

They are documentation moves only (content unchanged). They do not affect KluCoach. **Do not split or reset `1a585f7`.**

---

## Classification

### EXISTING (keep)

| Area | Status |
|------|--------|
| Modular monolith: `apps/api`, `apps/web`, `packages/database`, `packages/shared` | Keep |
| Prisma education-platform schema (`InstitutionType`, students, guardians, batches, …) | Keep |
| Session cookies + Argon2 + CSRF | Keep — do **not** replace with Clerk/Auth.js/Supabase Auth |
| Central RBAC `policies.ts` | Keep |
| Tenant scoping from session | Keep |
| Fastify + `@fastify/helmet` + `@fastify/rate-limit` (global 300/min) | Keep; tighten route limits |
| Zod in `@klunex-edu/shared` | Keep; share with frontend forms |
| Demo seed + Playwright smoke + Vitest isolation | Keep |
| Custom CSS Student 360 look (ink / saffron / paper) | Keep as product theme |

### REUSABLE

- KluNex Engineering Framework: tenant column, migrations not `db push`, MVP discipline (patterns only; no code copy)
- KluCare: Fastify/Prisma/Zod/pnpm workspace *ideas* already applied; still do not copy hospital code
- Existing KluCoach domain routes and dashboards: incrementally restyle, do not rewrite

### NEEDS CHANGE

| Gap | Direction |
|-----|-----------|
| Frontend is hand-rolled tables/forms/`useEffect` fetch | shadcn primitives + TanStack Table/Query + RHF |
| One global rate limit | Route-specific auth/invite limits; skip health |
| Hand-rolled CSV parser; XLSX rejected | Papa Parse + ExcelJS behind a parse port |
| No shared DataTable / form field components | Add once, reuse |
| No `docs/OPEN_SOURCE.md` | Add |
| Web `build` uses `tsc -b` without project references | Fix typecheck script |

### NOT NEEDED (this phase)

BullMQ, Redis, Kafka, Kubernetes, microservices, Elasticsearch, TipTap, Next.js, cloning a shadcn SaaS starter, third-party auth SaaS.

### RISK

| Risk | Mitigation |
|------|------------|
| Tailwind preflight would break Playwright + existing CSS | Import theme/utilities only; keep current class names |
| TanStack Table v9 API (`useTable`, explicit features) ≠ v8 `useReactTable` | Follow current docs; no v8 copy-paste |
| ExcelJS size on API | API-only; never ship to parent PWA bundle |
| Accidental tenant leak via new table/query helpers | Server remains authoritative; isolation tests stay required |
| Parent git repo mixed products | KluCoach stays self-contained under `KluCoach/` |

---

## Existing architecture (unchanged)

KluNex Education Platform core in `apps/api/src/platform/*`. KluCoach is `InstitutionType.COACHING` plus `products/coach`. Auth, tenancy, and Prisma remain the source of truth. See [ARCHITECTURE.md](./ARCHITECTURE.md).

---

## OSS integration (this phase)

Implemented incrementally on top of `1a585f7` — foundation not replaced.

| Area | Status |
|------|--------|
| shadcn-style primitives in `apps/web/src/ui/` | IMPLEMENTED — theme tokens unchanged; Tailwind utilities without preflight |
| DataTable (TanStack Table v9) | IMPLEMENTED — Students is the canonical screen |
| React Hook Form + Zod | IMPLEMENTED — login uses shared `loginSchema` |
| TanStack Query | IMPLEMENTED — `students/queries.ts` |
| Papa Parse + ExcelJS parse port | IMPLEMENTED — plus domain validation (no silent skips) |
| Helmet + route-specific rate limits | IMPLEMENTED |
| BullMQ / Redis / TipTap / starter clone | NOT STARTED / rejected |

See [OPEN_SOURCE.md](./OPEN_SOURCE.md).
