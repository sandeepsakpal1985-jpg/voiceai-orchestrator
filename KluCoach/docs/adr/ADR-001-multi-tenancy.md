# ADR-001 Multi-tenancy

## Status

Accepted

## Context

KluCoach is multi-tenant SaaS. Tenant A must never read Tenant B's students, parents, attendance, marks, notices, or fees.

## Decision

Shared PostgreSQL database. Every tenant-owned row has `institutionId`. Tenant context is taken from the authenticated session. Client-supplied tenant IDs are ignored as authority.

Failed cross-tenant access returns 404.

## Consequences

- Simple operations, cheap to run
- Application bugs can leak data if a query omits `institutionId` — mitigated by service helpers and tests
- Row-level security in Postgres is a future hardening option, not MVP
