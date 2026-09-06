# Roadmap

Items here are **not** in the current build phase. Do not implement them because they are interesting.

---

## Phase 2 deferred

Do not interrupt Student 360 / parent experience for:

- PDF / XLSX export
- Teacher hard-delete
- Full Playwright suite expansion beyond proven workflows

Assignment submit-by-id is implemented (non-file path).

---

## Phase 3 — Student 360 + Parent Experience

Aggregation API, deterministic status, parent multi-child home, student own view. See [ADR-011](./adr/ADR-011-student-360-aggregation.md). Do not expand admin CRUD to finish this phase.

---

## Phase 4 — Communication / engagement

In-app notifications around Student 360 data. See [ADR-012](./adr/ADR-012-notification-engagement.md). Not a chat product.

Deferred from this phase (do not treat as implemented):

- Live SMTP/SMS/WhatsApp/push delivery
- Assignment due-soon / overdue job (job runner exists; this reminder is still a stub)
- Fee due notifications
- Teacher notification dashboard
- Browser/mobile push

---

## Phase 5 — Billing + subscriptions + partner economics

Plans, snapshots, entitlements, institution invoices, manual payments, partner report. See [ADR-013](./adr/ADR-013-billing-subscriptions.md) and [BILLING.md](./BILLING.md). Not a payment gateway.

---

## Phase 6 — Production readiness + payment collection

Password reset, fail-fast production config, Razorpay provider abstraction, verified webhooks, lifecycle worker, observability, backup restore drill, Compose/Caddy runbooks. See [PAYMENTS.md](./PAYMENTS.md), [PRODUCTION_RUNBOOK.md](./PRODUCTION_RUNBOOK.md), ADR-014–017.

Live Razorpay sandbox checkout and a public HTTPS host remain **BLOCKED** until keys and a VPS exist. `PAYMENTS_ENABLED` stays false until that cutover.

Deferred from this phase:

- Automatic partner payouts
- GST filing (legal/accounting validation required)
- Complex proration / dunning
- PDF invoices
- Live SMTP in this development environment

---

## Phase 7 — AI Student Insights

On-demand insights over authorized Student 360 / teacher batch / admin tenant aggregates. Default `AI_ENABLED=false`. Test provider for CI. No RAG, no vector DB, no LangChain, no autonomous writes. See [AI.md](./AI.md) and [ADR-018](./adr/ADR-018-ai-student-insights.md).

Live OpenAI (or other vendor) quality checks remain **BLOCKED** until keys exist.

Deferred from this phase:

- Persistent AI chat history
- Embeddings / document RAG
- Per-tenant `institution.aiEnabled`
- AI usage billing

---

## Phase 8 — Proactive Student Insights

Rule-based attendance, academic, and overdue-assignment insights delivered through the existing notification system. Configurable thresholds. Deduplicated. Optional AI wording is off by default. No predictive risk engine. **COMPLETE — VALIDATED** 2026-09-05. See [PROACTIVE_INSIGHTS.md](./PROACTIVE_INSIGHTS.md) and [ADR-019](./adr/ADR-019-proactive-student-insights.md).

Deferred from this phase:

- Teacher batch insight aggregation UI
- SMS/WhatsApp insight channels
- Complex preference center (attendance/academic/assignment/positive toggles beyond existing alert flags)
- LLM-decided risk classification

---

## Phase 9 — Student Movement & SafeTrack

RFID-first digital gate. GPS is a later stage. See [SAFETRACK.md](./SAFETRACK.md) and [ADR-020](./adr/ADR-020-student-movement-safetrack.md).

| Slice | Status | Scope |
|-------|--------|-------|
| **9A Digital Gate** | VALIDATED | Card/device, ENTRY/EXIT, parent alerts, Student 360 sibling fetch, no GPS |
| **9B Multiple gates** | NOT IMPLEMENTED | Hostel/back/parking gates using existing `AccessGate` |
| **9C GPS** | NOT IMPLEMENTED | Live location, geofence, routes, SOS — only after RFID demand and privacy review |

Deferred from 9A:

- Physical RFID reader installation / OEM quotes
- SMS/WhatsApp movement alerts
- SafeTrack billed plan snapshot / hardware SKU
- Teacher live-location roster
- Movement in AI context

Teacher batch insight aggregation remains deferred (still not a predictive engine).

## Phase 10 — Production hardening and pilot readiness

Make the existing product reliable enough for one controlled institute. No SafeTrack 9B/9C, no GPS, no new AI. See [PILOT_RUNBOOK.md](./PILOT_RUNBOOK.md), [PILOT_CHECKLIST.md](./PILOT_CHECKLIST.md), [PILOT_METRICS.md](./PILOT_METRICS.md), [PILOT_FEEDBACK.md](./PILOT_FEEDBACK.md).

Further out:

- Broader AI insights with tenant/role-respecting retrieval (only when cost model allows)
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
