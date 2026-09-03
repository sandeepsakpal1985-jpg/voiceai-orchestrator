# Production runbook

Single VPS. Docker Compose. No Kubernetes.

## Initial deployment

1. Copy `.env.example` to a host-only env file. Set `APP_ENV=production`, `NODE_ENV=production`.
2. Generate `SESSION_SECRET` (≥32 random characters). Never reuse the example value.
3. Set `COOKIE_SECURE=true`, `PUBLIC_APP_URL` and `APP_BASE_URL` to `https://…`, and `API_CORS_ORIGINS` to the same origin.
4. Set Postgres credentials. Do not publish port 5432 to the internet.
5. Leave `PAYMENTS_ENABLED=false` until Razorpay live/test keys and the webhook secret are ready.
6. `docker compose -f docker-compose.prod.yml build`
7. `docker compose -f docker-compose.prod.yml up -d postgres`
8. Run migrations: `docker compose -f docker-compose.prod.yml run --rm api node ../../packages/database/...`  
   From a migrate-capable image/task: `pnpm --filter @klunex-edu/database migrate:deploy` against the production `DATABASE_URL`.
9. **Do not seed demo data in production.** Create the first super-admin out of band.
10. Start `api`, `worker`, `web`, `caddy`.
11. Confirm `GET /health` and `GET /ready`.
12. Confirm cookies are `Secure` over HTTPS (`trustProxy` is enabled on the API).

## Payments

Set `PAYMENTS_ENABLED=true`, `PAYMENT_PROVIDER=razorpay`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `PAYMENT_WEBHOOK_SECRET`.

Webhook URL: `https://<domain>/webhooks/razorpay`

Restart API after enabling. Startup validation fails closed if keys are missing.

## Email

Set `SMTP_HOST` (and auth). Super-admin `POST /ops/email/verify` checks SMTP connectivity. Automated tests must not send real mail (`VITEST` uses an in-memory transport).

## Backups

See [BACKUP_RECOVERY.md](./BACKUP_RECOVERY.md). After first deploy, run `scripts/verify-backup.ps1` against a copy, not blindly against production.

## Rollback

1. Keep previous image tags.
2. Restore the database dump taken before the bad release if the schema migrated forward and cannot be reversed.
3. Historical Prisma migrations are not edited.

## Logs

JSON to stdout. Request ids are on every error payload (`error.requestId`). Payment webhook logs include provider, event processing result, and status code — never secrets or PAN/CVV.

## Seed policy

Demo accounts (`@example.test`) belong in development/demo only. Production configuration validation rejects weak session secrets and the test payment provider.
