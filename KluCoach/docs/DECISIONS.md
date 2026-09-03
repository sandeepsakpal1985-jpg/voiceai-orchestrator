# Decisions

Index of architectural decision records.

| ID | Title | Status |
|----|-------|--------|
| [ADR-001](./adr/ADR-001-multi-tenancy.md) | Multi-tenancy | Accepted |
| [ADR-002](./adr/ADR-002-modular-monolith.md) | Modular monolith | Accepted |
| [ADR-003](./adr/ADR-003-authentication.md) | Session authentication | Accepted |
| [ADR-004](./adr/ADR-004-student-parent-relationship.md) | Student–parent relationship | Accepted |
| [ADR-005](./adr/ADR-005-file-storage.md) | File storage port | Accepted |
| [ADR-006](./adr/ADR-006-notification-architecture.md) | Notification ports | Accepted |
| [ADR-007](./adr/ADR-007-subscription-model.md) | Configurable subscriptions | Accepted |
| [ADR-008](./adr/ADR-008-education-platform-core.md) | Platform vs KluCoach product | Accepted |
| [ADR-009](./adr/ADR-009-operating-cost-discipline.md) | No unfunded per-student variable cost | Accepted |
| [ADR-010](./adr/ADR-010-commodity-oss.md) | Commodity OSS vs owned domain | Accepted |
| [ADR-011](./adr/ADR-011-student-360-aggregation.md) | Student 360 aggregation | Accepted |
| [ADR-012](./adr/ADR-012-notification-engagement.md) | Notification engagement | Accepted |
| [ADR-013](./adr/ADR-013-billing-subscriptions.md) | Billing and subscriptions | Accepted |
| [ADR-014](./adr/ADR-014-payment-provider.md) | Payment provider | Accepted |
| [ADR-015](./adr/ADR-015-webhook-architecture.md) | Webhook architecture | Accepted |
| [ADR-016](./adr/ADR-016-job-runner.md) | Job runner | Accepted |
| [ADR-017](./adr/ADR-017-production-deployment.md) | Production deployment | Accepted |

KluCare was inspected for patterns only. We did not adopt JWT+bcrypt or hospital schema.

Commit `1a585f7` also contains unrelated `ai-sales-agent` documentation moves. History is not rewritten; see [INITIAL_AUDIT.md](./INITIAL_AUDIT.md).

The tenant **is** `Institution`. We did not add a second Institution table. `*InTenant` helpers 404 when a foreign id is used as a write/filter handle.

Phase 2: one shared DataTable; list endpoints accept optional `page` (envelope `{ items, total, page, pageSize }`) and keep unpaged array responses for compatibility. Parent invitations auto-create a guardian when `guardianId` is omitted. Marks above `maxMarks` are rejected server-side.

Phase 3: Student 360 is a typed aggregation over existing domain rows (`GET /students/:id/360`). Status is deterministic (`student360-status.ts`). No AI, no Redis, no billing rebuild. See [ADR-011](./adr/ADR-011-student-360-aggregation.md).

Phase 4: Domain events (absence, published results, assignment created, notice published, meaningful timetable change) go through `NotificationService`. Recipients are derived server-side. In-app is the executed channel. Email is a port (no live SMTP in this phase). SMS/WhatsApp/push are not implemented. See [ADR-012](./adr/ADR-012-notification-engagement.md). ADR-006 remains the channel-port decision.

Phase 5: Commercial engine (plans, snapshots, entitlements, institution invoices, manual payments, partner report). Prices live in configuration. Demo tenants are `NON_BILLABLE`. See [ADR-013](./adr/ADR-013-billing-subscriptions.md) and [BILLING.md](./BILLING.md).

Phase 6: Production config, password reset, Razorpay behind `PaymentProvider`, verified webhooks, PostgreSQL job runner, email/storage ports, backup restore drill, Compose + Caddy. Payments stay off until `PAYMENTS_ENABLED=true` with real keys. See ADR-014–017, [PAYMENTS.md](./PAYMENTS.md), [PRODUCTION_RUNBOOK.md](./PRODUCTION_RUNBOOK.md).
