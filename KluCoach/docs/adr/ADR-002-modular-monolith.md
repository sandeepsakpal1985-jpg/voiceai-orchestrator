# ADR-002 Modular monolith

## Status

Accepted

## Context

Spec forbids microservices in MVP. We still need a reusable education core for KluSchool/KluCollege.

## Decision

One Fastify process. Modules under `apps/api/src/platform/*` (core) and `apps/api/src/products/coach` (KluCoach mode). One Prisma schema. One web app.

## Consequences

- Single deploy, low ops cost
- Clear folder boundaries for later extraction if ever needed
- Discipline required to keep coach-specific UI out of core tables
