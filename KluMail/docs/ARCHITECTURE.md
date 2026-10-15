# Architecture

KluMail is one Next.js application with a PostgreSQL database. Business rules live in `src/server`. Pages in `src/app` render that data. The browser does not receive database credentials or OAuth tokens.

## Modules

- `src/server/auth.ts` — registration, sessions, password reset, verification.
- `src/server/actor.ts` — session to organization membership and role.
- `src/server/workspace.ts` — organizations, invitations, teams, categories, tags, preferences.
- `src/server/tickets.ts` — ticket lifecycle, customers, assignment, merge.
- `src/server/conversation.ts` — notes, replies, drafts, attachments.
- `src/server/mailboxes.ts` — connect, disconnect, mock injection.
- `src/server/providers.ts` — Gmail, Microsoft Graph, and the mock provider.
- `src/server/sync.ts` — idempotent ingestion and outbound delivery.
- `src/server/jobs.ts` — durable jobs with skip-locked claims and backoff.
- `src/server/insights.ts` — dashboards, CSV export, notification reads.
- `src/server/http.ts` — HTTP API used by forms and the reply composer.
- `src/lib` — validation, permissions, ticket transitions, threading, crypto, HTML sanitizing.

## Tenancy

Every request sets `app.user_id` and, when an organization is selected, `app.organization_id` for the transaction. Row-level security is forced. The browser's organization id is only a hint. Membership is checked in the database.

Three login roles are used:

- `klumail_app` for interactive requests. It is not a superuser and cannot bypass RLS.
- `klumail_worker` for jobs, tokens, and the mock mailbox tables.
- `klumail_auth` for passwords, sessions, reset tokens, and system email.

The admin URL is used by migrations only.

## Mail

Provider code is behind one adapter. Tickets store provider thread ids and message-id headers. Subject equality never threads a conversation. Outbound messages are stored before send, and a retry looks up the provider copy by the application message id so a second send is not created.

Jobs are rows in `background_jobs`. A request may process a few jobs before returning. `scripts/worker.ts` is the long-running processor. A failed sync records mailbox `last_error` in its own transaction so a rollback of the ingest does not hide the failure.

## Phase 2

`domain_events` records facts such as `ticket.created` and `message.sent`. No consumer in Phase 1 calculates SLA or AI features.
