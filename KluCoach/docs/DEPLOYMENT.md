# Deployment

Target: a single VPS. No Kubernetes.

## Server requirements (starting point)

- 2 vCPU, 4 GB RAM minimum (4 vCPU / 8 GB more comfortable)
- Docker + Docker Compose
- Disk for Postgres + file storage
- Domain + TLS terminator (Caddy or nginx)

## Services

`docker-compose.yml`: `postgres`, `api`, `web` (local). Production: `docker-compose.prod.yml` adds `worker` and Caddy. See [PRODUCTION_RUNBOOK.md](./PRODUCTION_RUNBOOK.md) and [ADR-017](./adr/ADR-017-production-deployment.md).

## Environment

- `APP_ENV=production`
- `DATABASE_URL`
- `SESSION_SECRET` (long random; production rejects denylisted examples)
- `COOKIE_SECURE=true`
- `PUBLIC_APP_URL` / `APP_BASE_URL` (https)
- `API_CORS_ORIGINS`
- When `PAYMENTS_ENABLED=true`: `PAYMENT_PROVIDER=razorpay`, Razorpay keys, `PAYMENT_WEBHOOK_SECRET`

## Database

```bash
pnpm --filter @klunex-edu/database migrate:deploy
pnpm --filter @klunex-edu/database seed   # refused when APP_ENV or NODE_ENV is production
```

Never use `prisma db push` as the production migration strategy.

## Health

- `GET /health` — process up
- `GET /ready` — database reachable

## Backups

See [BACKUP_RECOVERY.md](./BACKUP_RECOVERY.md). A dump that has never been restored is not validated.

Executed on 2026-09-02 against local Compose Postgres (`localhost:55433`): dump → restore into `klucoach_restore_check` → `institutions` count **2** → `RESTORE_VERIFIED`.

## HTTPS / rollback

Terminate TLS at Caddy or nginx (`deploy/Caddyfile`, `deploy/nginx-proxy.conf.example`). HTTP should redirect to HTTPS. Fastify `trustProxy` is enabled so Secure cookies work behind the proxy. Live public TLS for this development machine is **BLOCKED — INFRASTRUCTURE**.

## Logs

JSON logs to stdout. Collect with Docker/journald.

Do not claim HTTPS, backups, or production config until they are actually set on a host.
