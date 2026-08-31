# Deployment

Target: a single VPS. No Kubernetes.

## Server requirements (starting point)

- 2 vCPU, 4 GB RAM minimum (4 vCPU / 8 GB more comfortable)
- Docker + Docker Compose
- Disk for Postgres + file storage
- Domain + TLS terminator (Caddy or nginx)

## Services

`docker-compose.yml`: `postgres`, `api`, `web`.

## Environment

Copy `.env.example`. Required in production:

- `DATABASE_URL`
- `SESSION_SECRET` (long random)
- `COOKIE_SECURE=true`
- `PUBLIC_APP_URL`
- `API_CORS_ORIGINS`

Optional: SMTP for email invites.

## Database

```bash
pnpm --filter @klunex-edu/database migrate:deploy
pnpm --filter @klunex-edu/database seed   # non-production / demo only
```

Never use `prisma db push` as the production migration strategy.

## Health

- `GET /health` — process up
- `GET /ready` — database reachable

## Backups

**Not configured by this repository automatically.** Production must add:

1. `pg_dump` on a schedule
2. Retention (e.g. 7 daily / 4 weekly)
3. Off-box copy
4. Restore procedure drill

Restore:

```bash
psql "$DATABASE_URL" < backup.sql
```

File storage directory must be backed up with the database.

## HTTPS / rollback

Terminate TLS at the reverse proxy. Rollback: previous Compose image tags + `migrate` is forward-only — restore DB from backup if a release is bad.

## Logs

JSON logs to stdout. Collect with Docker/journald.

Do not claim HTTPS, backups, or production config until they are actually set on a host.
