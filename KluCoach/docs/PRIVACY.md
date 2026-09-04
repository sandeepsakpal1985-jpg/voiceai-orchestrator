# Privacy

KluCoach / KluNex Education Platform processes personal data of students, including minors, plus parents, teachers, and staff.

**We do not sell student data. We do not use student data for advertising. We do not build behavioral advertising profiles. We do not expose student data between institutions.**

This document is engineering intent. Legal compliance (DPDP Act, school/board rules, contract terms) must be validated separately before commercial launch.

---

## Data we collect (MVP)

| Category | Examples | Why |
|----------|----------|-----|
| Account | name, email, phone, password hash | login, invitations |
| Student profile | name, DOB, gender, contacts, address, photo, admission no. | Student 360, operations |
| Relationships | parent/guardian links | authorized access |
| Academic | batches, attendance, assessments, assignments, timetable | core product |
| Communications | notices, in-app notifications, optional email | engagement |
| Commercial | fee/subscription config, entitlements | billing later |
| Audit | who did what, when | security, disputes |
| Files | assignment attachments, photos | product features |

---

## Lawful basis / purpose (engineering)

- Provide the service the institution contracted
- Allow parents to view their child's coaching journey
- Security, abuse prevention, audit

Not for: ads, resale, cross-institution profiling, training public AI models on identifiable student data. Optional AI insights send a minimized, already-authorized snapshot to a configured processor only when a user explicitly asks. AI is off by default.

---

## Access

- Tenant isolation
- RBAC + parent-child link
- Teachers scoped to assigned batches
- SUPER_ADMIN is a platform operator role; use least privilege in production

---

## Retention and deletion

- Prefer **soft archive** for educational records (`status`, `archivedAt`) rather than casual hard delete
- Account closure / institution offboarding: documented procedure in DATA_PROTECTION.md
- Audit logs retained longer than day-to-day operational rows
- Exact legal retention periods are **not** encoded as product law; configure per tenant agreement later

---

## Children and guardians

- Parent/guardian relationship is authoritative for minors' product access
- Student accounts may exist; they do not override guardian access policy
- Invitations use opaque tokens; tokens are hashed at rest

---

## Third parties (processors)

MVP:

| Processor | Data | Notes |
|-----------|------|-------|
| Hosting VPS / Postgres | all | operator-controlled |
| Email provider (optional) | email, name, invite link | only if configured |
| AI provider (optional) | minimized Student 360 / batch / institution facts plus the user question | only if `AI_ENABLED=true` and a provider is configured; see [AI.md](./AI.md) |
| SMS / WhatsApp | none in MVP | interfaces only |

No analytics SDKs that profile children. No advertising pixels.

---

## Rights (product hooks)

Institution admin can export CSV reports (tenant-scoped). Full data-subject request workflow is a roadmap item; record in ROADMAP.md.

When AI is enabled, a parent/student/teacher/admin can choose not to click Ask. There is no automatic generation. Turning `AI_ENABLED=false` stops new provider calls. KluCoach does not claim that an external provider deletes historical prompts.
