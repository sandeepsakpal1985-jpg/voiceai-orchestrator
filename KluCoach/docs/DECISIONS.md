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

KluCare was inspected for patterns only. We did not adopt JWT+bcrypt or hospital schema.

Commit `1a585f7` also contains unrelated `ai-sales-agent` documentation moves. History is not rewritten; see [INITIAL_AUDIT.md](./INITIAL_AUDIT.md).
