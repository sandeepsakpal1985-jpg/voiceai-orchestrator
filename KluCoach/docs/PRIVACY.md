# Privacy

KluCoach / KluNex Education Platform processes personal data of students, including minors, plus parents, teachers, and staff.

**We do not sell student data. We do not use student data for advertising. We do not build behavioral advertising profiles. We do not expose student data between institutions.**

This document is engineering intent. **LEGAL REVIEW REQUIRED** before broad commercial launch. Do not treat this file as DPDP Act certification, board-rule compliance, or a signed DPA.

---

## Data we collect (MVP)

| Category | Examples | Why |
|----------|----------|-----|
| Account | name, email, phone, password hash | login, invitations |
| Student profile | name, DOB, gender, contacts, address, photo, admission no. | Student 360, operations |
| Relationships | parent/guardian links | authorized access |
| Academic | batches, attendance, assessments, assignments, timetable | core product |
| Communications | notices, in-app notifications, optional email | engagement |
| Gate movement | RFID/NFC entry/exit at a named gate, timestamp, device | parent safety alerts (Phase 9A) |
| GPS location | not collected in 9A | Phase 9C only, guardian authorization required |
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
- Teachers scoped to assigned batches; **teachers do not inherit live location or gate history**
- SUPER_ADMIN is a platform operator role; use least privilege in production
- Gate movement: parent (linked child), student (self), institution admin (tenant / today's log). Foreign student ids **404**. RFID UIDs are not public search fields. Unknown/revoked cards do not notify parents.

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
- Student academic data, movement (gate ENTRY/EXIT), and notifications are visible only to linked guardians, the student (self), and authorized tenant staff — never another institution
- Data minimization: Student 360 and AI context omit passwords, sessions, payment secrets, and unnecessary contacts

## Responsibilities

| Party | Responsibility |
|-------|----------------|
| Institution | Lawful collection of student/guardian data; accurate guardian links; parent consent where required; staff access hygiene |
| KluNex | Tenant isolation, RBAC, hashing secrets, not selling data, not advertising, hosting controls described in SECURITY.md |
| Parent / guardian | Keep login private; set notification preferences |

## Retention

See [DATA_PROTECTION.md](./DATA_PROTECTION.md). Automated destruction of academic or billing history is **not implemented**. Do not claim it is.

## Deletion requests

Record the request. Soft-archive in product. Hard delete only under written agreement. **LEGAL REVIEW REQUIRED** for DPDP data-principal requests before treating the product as a complete workflow.

## Third parties (processors)

MVP:

| Processor | Data | Notes |
|-----------|------|-------|
| Hosting VPS / Postgres | all | operator-controlled |
| Email provider (optional) | email, name, invite link | only if SMTP is configured; **BLOCKED — EXTERNAL PROVIDER** until then |
| Payment provider (Razorpay) | invoice/checkout metadata | only if `PAYMENTS_ENABLED=true`; live keys **BLOCKED** in this environment |
| AI provider (optional) | minimized Student 360 / batch / institution facts plus the user question | only if `AI_ENABLED=true` |
| SMS / WhatsApp | none in this phase | future providers would be institution-paid; interfaces only |

No analytics SDKs that profile children. No advertising pixels.

---

## Rights (product hooks)

Institution admin can export CSV reports (tenant-scoped). Full data-subject request workflow is a roadmap item; record in ROADMAP.md.

When AI is enabled, a parent/student/teacher/admin can choose not to click Ask. There is no automatic generation. Turning `AI_ENABLED=false` stops new provider calls. KluCoach does not claim that an external provider deletes historical prompts.

Proactive insights store operational facts (percentages, assignment identifiers, due dates). They do not infer mental health, medical conditions, intelligence, personality, family circumstances, or socioeconomic status. Optional insight wording is off unless `INSIGHT_AI_WORDING=true`.
