# ADR-017 Production deployment

## Status

Accepted

## Context

KluCoach must be deployable on a single VPS at a cost compatible with ~₹500/student/year realization.

## Decision

Docker Compose production file: Postgres (not published), API (non-root, `node dist/index.js`), worker (`node dist/worker.js`), nginx static web, Caddy for HTTPS. `prisma migrate deploy` only. Reverse proxy sets `X-Forwarded-Proto`; Fastify `trustProxy` is on so Secure cookies work.

## Consequences

No cluster scheduler. Horizontal scale later is still Compose replicas + Postgres, not a rewrite.
