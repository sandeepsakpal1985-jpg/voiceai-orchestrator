# Pilot runbook

Operational path for a **controlled first institute**, not a general launch. Companion to [PRODUCTION_RUNBOOK.md](./PRODUCTION_RUNBOOK.md), [DEPLOYMENT.md](./DEPLOYMENT.md), and [BACKUP_RECOVERY.md](./BACKUP_RECOVERY.md).

This is engineering procedure. It is not a legal, GST, or DPDP compliance sign-off.

## 1. Prerequisites

- One coaching institute, about 100–500 students, 1–2 branches
- Domain name and TLS (Caddy in `docker-compose.prod.yml`)
- VPS with Docker Compose (no Kubernetes)
- Postgres 16, daily `pg_dump` destination
- Written institution agreement and a confirmed student count for billing
- `PAYMENTS_ENABLED=false` until Razorpay is explicitly cut over
- SafeTrack hardware optional; software gate works with the admin test punch

## 2. Environment variables

Copy `.env.example` to a host-only file. Production **fails closed** when:

- `SESSION_SECRET` is weak or shorter than 32 characters
- `COOKIE_SECURE` is not `true`
- `PUBLIC_APP_URL` is not `https://` (except `http://127.0.0.1`)
- `ALLOW_DEV_RESET_TOKEN=true`
- `PAYMENT_PROVIDER=test`
- `API_CORS_ORIGINS=*`
- Payments or AI enabled without real provider secrets

Never put secrets in git, health payloads, or error messages.

Required for boot: `DATABASE_URL`, `SESSION_SECRET`, `COOKIE_SECURE=true`, `PUBLIC_APP_URL`, `API_CORS_ORIGINS`.

Leave off until needed: `PAYMENTS_ENABLED`, `AI_ENABLED`, `SMTP_HOST`.

## 3. Database setup

1. Start Postgres only: `docker compose -f docker-compose.prod.yml up -d postgres`
2. Confirm `pg_isready`
3. **Do not** `prisma db push` in production

## 4. Migrations

```bash
pnpm --filter @klunex-edu/database migrate:deploy
```

Migrations live under `packages/database/prisma/migrations/` (`init` through `safetrack_movement`). History is not rewritten.

**Backup before migrate.** Prisma does not provide automatic down-migrations; rollback is restore-from-dump.

## 5. Seed / demo

`pnpm db:seed` is for development/demo only. It creates `@example.test` accounts and synthetic students.

**Do not seed production.** Create the first super-admin out of band.

Demo logins (development/demo only, password `DemoPassw0rd!`): `admin@example.test`, `teacher@example.test`, `student@example.test`, `parent@example.test`. Never enable these in a live institute.

## 6. Deployment

See [PRODUCTION_RUNBOOK.md](./PRODUCTION_RUNBOOK.md). API image runs as user `klucoach` (non-root). Web image is nginx serving the Vite build as user `nginx`, listening on **8080** (Caddy proxies `web:8080`).

```bash
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d
```

## 7. HTTPS

Caddy terminates TLS. Set `PUBLIC_APP_URL` and `API_CORS_ORIGINS` to that origin. Cookies are `Secure` when `COOKIE_SECURE=true`.

Public HTTPS on this development machine: **BLOCKED — INFRASTRUCTURE**.

## 8. Health checks

- `GET /health` — process up (`status`, `appEnv`, payment/AI flags). No secrets, no database contents.
- `GET /ready` — `SELECT 1` against Postgres.

Use these from Compose/Caddy. Request ids are on error payloads.

## 9–10. Backups and restore

[BACKUP_RECOVERY.md](./BACKUP_RECOVERY.md). Daily `pg_dump -Fc`, 7 daily / 4 weekly retention. Script: `scripts/verify-backup.ps1` against a **copy**, never as a destructive production wipe.

## 11. Logs

JSON to stdout. Redacted: cookies, `Authorization`, `x-access-device-secret`. Do not log passwords, session tokens, reset tokens, device secrets, payment secrets, or raw card secrets.

## 12. Payment cutover

Default remains `PAYMENTS_ENABLED=false`.

When ready: Razorpay account, live keys, HTTPS, webhook `https://<domain>/webhooks/razorpay`, `PAYMENT_WEBHOOK_SECRET`, `PAYMENT_PROVIDER=razorpay`. Amounts come from stored invoice outstanding balance. Duplicate webhooks are idempotent.

Live Razorpay: **BLOCKED — EXTERNAL PROVIDER** until keys exist. Test provider proves the software path.

## 13. SMTP

Optional. Set `SMTP_HOST`, port (587 STARTTLS with `SMTP_SECURE=false`, or 465 with `SMTP_SECURE=true`), `SMTP_USER` / `SMTP_PASS`, `SMTP_FROM`. Super-admin `POST /ops/email/verify`.

There is **no automatic retry queue**. In-app notifications are written first; an SMTP failure does not roll back attendance, marks, or billing. IN_APP works with SMTP unset.

Live SMTP: **BLOCKED — EXTERNAL PROVIDER** until a host is configured.

## SMS / WhatsApp

Not implemented. `NotificationProvider` ports exist (`SMS`, `WHATSAPP`) as no-ops. Do not add a vendor in this phase.

Possible later events (institution-paid usage, no vendor lock-in in domain code): parent ENTRY/EXIT, absence, fee due, assessment result, reminder. IN_APP remains the executed channel for the pilot.

## 14. Rollback

Keep previous image tags. If a migration already applied, restore the pre-migrate dump. Do not edit historical migration files.

## 15. Incidents

[INCIDENT_RESPONSE.md](./INCIDENT_RESPONSE.md). Rotate `SESSION_SECRET` only if you accept logging everyone out.

## 16. SafeTrack device setup (optional)

Software is 9A only (RFID punch, no GPS).

1. Create/confirm an `AccessGate` (demo: Main Gate)
2. Provision an `AccessDevice` with a high-entropy secret; store the Argon2 hash only
3. Issue `StudentCredential` UIDs (cards). Revoked status is treated as unknown (no parent notify)
4. Reader: `POST /access/ingest` with `x-access-device-id` and `x-access-device-secret`
5. Admin **Gate** page can test-punch without hardware

Physical readers/cards: **NOT VALIDATED — HARDWARE**.

## 17. Support

Triage: BUG / UX ISSUE / FEATURE REQUEST / COMMERCIAL REQUEST. Record institute, affected roles, frequency, and whether Student 360, billing, or movement is involved. Do not paste location or card secrets into tickets.
