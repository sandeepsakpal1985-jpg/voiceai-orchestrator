# Phase 1 progress

## Baseline

The `KluMail` directory started empty inside the `ai-orchestrator` git repository. Node 24 and PostgreSQL 16 were installed. The system cluster on port 5432 was not modified. The app uses a project-local cluster on `127.0.0.1:5433`.

## Implemented

- Next.js application shell, authentication, organizations, invitations, teams, and roles.
- Tickets, customers, conversations, internal notes, replies, and attachments.
- Provider adapter for Gmail, Microsoft Graph, and a labeled mock mailbox.
- Idempotent sync, outbound send with retry protection, and durable background jobs.
- Inbox filters, dashboards, CSV export, notifications, and organization settings.
- Forced row-level security and separate database roles for the app, worker, and auth paths.
- Unit, integration, and one Playwright journey covering setup, simulated mail, the ticket lifecycle, export denial, and cross-organization search.

## Verification log

- `npx tsc --noEmit --pretty false` — exit 0.
- `npx eslint .` — exit 0.
- `npx vitest run --reporter=verbose` — 21 passed, 0 failed, exit 0. Includes the logout regression.
- `npx next build` — exit 0. Next.js 16.4.1 compiled, typechecked, and generated the route table. Middleware deprecation is a warning.
- `npx playwright test` — 1 passed, 0 failed, exit 0, against `next start` on `127.0.0.1:3100`.
- `npm audit --json` — exit 1. Five high findings, all the `braces` advisory through the development ESLint config. No critical findings. See the sign-off.
- Migrations `001` through `006` applied to the development and test databases.

## Not started

Phase 2. Live Gmail and Microsoft 365 credentials were not available, so those providers were not executed against real mailboxes.
