# ADR-010 Commodity OSS vs owned domain

## Status

Accepted

## Context

Building every table, form, CSV parser, and icon set in-house slows KluCoach without differentiating it. Cloning a shadcn SaaS starter would import foreign auth and tenancy.

## Decision

Use OSS for commodity UI/infra (shadcn primitives, TanStack Table/Query, React Hook Form, Zod, Papa Parse, ExcelJS, Fastify helmet/rate-limit, date-fns, Lucide, Recharts where charts help).

Keep under KluCoach/KluNex control: session auth, RBAC, tenant isolation, education data model, import *authorization* and validation, partner pricing, Student 360.

Do not add BullMQ/Redis/Kubernetes in this phase.

## Consequences

- Faster admin screens with one DataTable and form pattern
- Must follow TanStack Table **v9** APIs
- Tailwind utilities added without replacing the existing Student 360 CSS (no preflight)
- Parse libraries sit behind `parseSpreadsheet`; swapping Papa/ExcelJS does not change tenant rules
