# Data protection

Operational companion to [PRIVACY.md](./PRIVACY.md) and [SECURITY.md](./SECURITY.md).

---

## Classification

| Class | Examples | Handling |
|-------|----------|----------|
| Secret | passwords, session tokens, invite tokens | hash; never log |
| Restricted | student PII, marks, attendance, contacts, gate entry/exit | tenant + RBAC |
| Highly restricted | GPS / live location (not collected in 9A) | guardian authorization; not in AI context |
| Operational | batch names, timetable | tenant |
| Public | marketing site (out of scope) | n/a |

---

## Retention

| Data | Default engineering policy | Automated deletion? |
|------|----------------------------|---------------------|
| Student records | Keep while institution is active; soft-archive via status / `archivedAt` | **NOT AUTOMATED** |
| Attendance | Keep with the student academic record | **NOT AUTOMATED** |
| Assessment results | Keep with the student academic record | **NOT AUTOMATED** |
| In-app notifications | 90-day purge via `purgeExpiredNotifications` (callable) | Callable; **not** a silent untested production cron in this phase |
| Audit logs | Keep; tenant-scoped | **NOT AUTOMATED** — no silent purge |
| Invitations | Expire; hash; single-use | Expired tokens not usable; row cleanup **NOT AUTOMATED** as a silent job |
| Billing invoices / payments / refunds | Keep for the life of the institution contract; **do not delete historical financial records because a subscription ends** | **NOT AUTOMATED** |
| SafeTrack movement | Last 30 days in the parent API window; rows remain in Postgres | **NOT AUTOMATED** beyond the query window |
| Uploaded files | Delete/orphan-clean with parent record archive (later job) | **NOT AUTOMATED** |
| Sessions | Expire (7 days idle default); delete on logout | Session expiry implemented |

Do not permanently delete educational records in casual admin “delete” actions. Do not silently delete student academic history. Do not claim automation that is not implemented.

---

## Deletion / offboarding

1. Institution requests offboarding
2. Export if contract requires
3. Disable login (`status`)
4. Schedule hard delete only under written agreement (not automated in MVP)

---

## Backups

See [DEPLOYMENT.md](./DEPLOYMENT.md). Production must have scheduled Postgres backups, retention, and a restore drill. **Do not claim backups are configured until they are.**

---

## File storage

Metadata in Postgres. Bytes in object storage (local disk MVP). MIME + size validation. No executable uploads.

---

## Notification providers

Only send to addresses/phones on file for that user. Tenant-scoped templates. No cross-tenant mailing.

---

## AI processor

When `AI_ENABLED=true`, a minimized JSON context (first name, attendance and academic summaries, pending assignment counts, batch/institution aggregates — not password hashes, sessions, payment secrets, or unnecessary contact PII) is sent to the configured provider together with the user question. Purpose: answer that explicit question. KluCoach does not store AI conversations in this phase. Application logs and audit rows must not contain the full context or answer. Retention at the vendor is **not** asserted here; use the provider contract. Disable with `AI_ENABLED=false`.

Proactive insight detection does not call a model. If `INSIGHT_AI_WORDING=true`, only the already-computed fact (title + numeric source) may be sent for rephrasing. Default off.

---

## Cross-institution

No student portability in MVP. A person who is a parent at Tenant A and Tenant B would have **separate accounts** unless a future identity layer is designed (roadmap).
