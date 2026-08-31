# KluCoach — Initial Repository Audit

**Date:** 2026-08-31  
**Workspace:** `C:\Users\sande\ai-orchestrator\KluCoach`  
**Status:** Greenfield. No existing KluCoach source was found.

---

## 1. Existing files in KluCoach

The `KluCoach/` directory was empty at audit time:

- no `package.json`
- no source tree
- no Prisma schema
- no documentation
- no nested `.git`

This directory is intended specifically for KluCoach. The product will remain self-contained here.

---

## 2. Parent repository context

KluCoach sits inside `C:\Users\sande\ai-orchestrator`, a large KluNex workspace that also contains:

| Path | Role |
|------|------|
| `KluCare/` | Hospital management SaaS (TypeScript monorepo) |
| `KluNex/` | Portfolio dashboard |
| `KluNex-Engineering-Framework/` | How to build (standards, MVP discipline, security) |
| `KluGarage`, `KluHR`, `KluHire`, … | Other KluNex products |
| Root `app/`, `ARCHITECTURE.md` | Unrelated VoiceAI orchestrator (Python/FastAPI) |

The parent git repository tracks many products. KluCoach will be a self-contained project under `KluCoach/` and will not import KluCare, KluChat, or VoiceAI code.

---

## 3. Existing architecture (sibling products)

### KluCare (inspected, not copied)

Reusable *patterns* (concepts only):

- pnpm workspace + TypeScript
- Fastify API + Prisma/PostgreSQL + Zod
- Tenant column (`organizationId`) on domain rows
- Unique `(tenant, email)` for users
- Central roles/permissions
- Demo seed + Docker Compose for Postgres
- Health endpoints, rate limiting, helmet
- Multi-tenant isolation as a first-class test concern

Explicitly **not reused**:

- KluCare source files, schema, JWT/bcrypt auth, hospital domain models
- Turbo pipeline, mobile apps, billing/pharmacy/lab modules
- Any patient/clinical data model

KluCare uses JWT + bcryptjs. KluCoach will use **session cookies + Argon2**, as specified.

### KluNex Engineering Framework (inspected)

Reusable *standards*:

- Tenant column on domain rows
- Few tables; justify expansions
- Migrations, not `db push` in production
- RBAC + tenancy on protected data
- Audit log for sensitive mutations
- MVP discipline: must-haves first, no feature creep
- Do not claim success without execution evidence

### Root VoiceAI orchestrator

Not relevant. Python/FastAPI/LiveKit. Do not depend on it.

---

## 4. Reusable components

| Concept | Source | How KluCoach uses it |
|---------|--------|----------------------|
| Shared-database multi-tenancy | KluCare pattern | `institutionId` on every tenant-owned row |
| Modular Fastify + Prisma + Zod | KluCare / spec | New implementation |
| Provider interfaces (notifications, files) | VoiceAI “provider-agnostic” idea + spec | New interfaces; no KluCare/VoiceAI code |
| Engineering docs layout | KluNex framework | `docs/ARCHITECTURE.md`, ADRs, PROGRESS |
| Demo tenant + fake PII | KluCare seed idea | New education-domain seed |

**No files were copied.**

---

## 5. Conflicting components

| Conflict | Decision |
|----------|----------|
| KluCare JWT vs spec session auth | Follow spec: server-side sessions + httpOnly cookies |
| KluCare bcrypt vs spec Argon2 | Follow spec: Argon2 |
| KluCare `Organization` naming | Use `Institution` (education domain) |
| Internal name “KluCoach” for the platform | Platform is **KluNex Education Platform**. KluCoach is the first commercial product / institution mode (`COACHING`) |
| Parent repo is a mixed Python + many products dump | Keep KluCoach isolated; no workspace dependency on sibling products |
| Engineering framework prefers JWT | ADR-003 records session cookies as the KluCoach/education-platform choice |

---

## 6. Risks

1. **Parent repo noise** — accidental imports or shared `node_modules` at repo root. Mitigation: KluCoach has its own lockfile, Docker, and docs; no `file:` deps into siblings.
2. **Schema lock-in** — if we model “batch” as coaching-only, KluSchool becomes a rewrite. Mitigation: education-platform core + `InstitutionType` + mode modules.
3. **₹500/student economics** — per-student variable cost (SMS, AI, video) would destroy margin. Mitigation: cost rule in architecture; in-app + email only in MVP; no AI.
4. **Child data** — high privacy bar. Mitigation: privacy/security docs, audit log, tenant isolation tests before any launch claim.
5. **Empty directory** — nothing to salvage; all code is new. Low reuse risk, higher build volume.

---

## 7. Recommendation

**Proceed as a greenfield modular monolith.**

1. Implement **KluNex Education Platform** core (identity, tenancy, students, academics, attendance, assessments, communication, billing data model).
2. Ship **KluCoach** as the first product on that core (`InstitutionType.COACHING`).
3. Stub School/College modes as configuration, not separate apps.
4. Do not copy KluCare/KluChat.
5. Do not delete anything in sibling products.
6. Prefer cheap-to-operate infrastructure: Postgres, local/object file storage, no per-request AI, no Kubernetes.

**Audit conclusion:** KluCoach has no usable prior code. Start with architecture docs, then Prisma schema, then auth/tenancy.
