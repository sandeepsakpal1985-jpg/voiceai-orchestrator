# Data protection

Operational companion to [PRIVACY.md](./PRIVACY.md) and [SECURITY.md](./SECURITY.md).

---

## Classification

| Class | Examples | Handling |
|-------|----------|----------|
| Secret | passwords, session tokens, invite tokens | hash; never log |
| Restricted | student PII, marks, attendance, contacts | tenant + RBAC |
| Operational | batch names, timetable | tenant |
| Public | marketing site (out of scope) | n/a |

---

## Retention

| Data | Default engineering policy |
|------|----------------------------|
| Active academic records | Keep while institution is active |
| Soft-archived students | Keep; exclude from default lists |
| Sessions | Expire (7 days idle default); delete on logout |
| Invitations | Expire; hash token |
| Audit logs | Keep; tenant-scoped; no silent purge in MVP |
| Uploaded files | Delete/orphan-clean with parent record archive (later job) |

Do not permanently delete educational records in casual admin “delete” actions. MVP uses status + `archivedAt`.

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
