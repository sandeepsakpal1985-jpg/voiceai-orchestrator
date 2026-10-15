# Phase 1 sign-off

## 1. Project and phase

KluMail, Phase 1, core operational platform. Completion date: 15 October 2026.

## 2. Final status

**CONDITIONALLY READY**

The operational platform builds, the automated suite passes, and tenant isolation holds for the tested paths. Live Gmail and Microsoft 365 mailboxes were not executed. That is a blocked production validation, not a passed integration.

## 3. Architecture implemented

Next.js App Router application with server-side services, PostgreSQL, and forced row-level security. Authentication is application-managed sessions because no Supabase project credentials were available. Supabase remains the documented production auth and database host; this repository does not pretend to be connected to it.

Three database roles separate the request path (`klumail_app`), background work (`klumail_worker`), and credentials (`klumail_auth`). The app role is not a superuser and cannot bypass RLS. OAuth tokens are encrypted with AES-256-GCM. Notification inserts go through the `create_notification` security-definer function so one member can be notified without weakening the table policy.

Background work is stored in `background_jobs` and processed with `SKIP LOCKED`, bounded attempts, and backoff. The same processor runs from `scripts/worker.ts` and from a short drain after user actions, so a job is a database row rather than an untracked promise.

## 4. Technology stack

Next.js 16.4.1, React 19, TypeScript strict, Tailwind CSS 4, Zod, React Hook Form, PostgreSQL 16, `pg`, Vitest, Playwright. Gmail API and Microsoft Graph adapters are implemented. The mock provider is used for development and tests.

## 5. Modules delivered

- Authentication, sessions, password reset, and email verification tokens.
- Organizations, memberships, invitations, teams, and roles (`org_admin`, `manager`, `agent`).
- Mailbox connection, OAuth state, encrypted tokens, Gmail and Microsoft adapters, and a labeled mock provider.
- Idempotent ingestion, threading by provider and message identifiers, replies, drafts, and internal notes.
- Customers, ticket lifecycle, assignment, tags, categories, search, filters, and standard inbox views.
- Role dashboards calculated from ticket rows, CSV export, in-app notifications, and organization settings.
- Audit log writes for sensitive account and organization actions.

Not delivered, by Phase 1 scope: AI replies, sentiment, SLA timers, FCR, quality scores, live chat, WhatsApp, voice, and enterprise billing. No screen shows those metrics.

## 6. Database schema and migrations

Migrations `db/migrations/001_init.sql` through `006_create_notification.sql` applied to both `klumail` and `klumail_test` through `npx tsx scripts/migrate.ts`. The project-local cluster listens on `127.0.0.1:5433`. The system cluster on port 5432 was not changed.

## 7. Mailbox integration status

| Provider | Code | Executed here |
| --- | --- | --- |
| Mock | Connect, sync, send, token expiry, duplicate suppression | Yes. Labeled simulated. |
| Gmail API | OAuth, message parse, send, sync cursor | No. Credentials were not configured. |
| Microsoft Graph | OAuth, message parse, send, sync cursor | No. Credentials were not configured. |

Polling plus reconciliation is the default. Webhooks are accepted when the optional topic or webhook URL is set. They were not called by Google or Microsoft in this environment.

## 8. Features that use mocks

Mailbox connection, inbound injection, outbound acceptance, token refresh, and the Playwright journey use the mock provider. Dashboard numbers in tests come from rows written by those flows. The development seed is separate and only runs when `SEED_DEMO=true`.

## 9. Tests executed

22 automated tests.

- `npx vitest run --reporter=verbose` — 21 tests (12 unit, 9 integration), exit 0, about 35 seconds. One expected warning line records the simulated sync failure that the recovery test then clears.
- `npx playwright test` — 1 test, exit 0, about 1.1 minutes of test time on `next start` at `http://127.0.0.1:3100`.

## 10. Passed

22.

## 11. Failed

0.

## 12. Blocked or not tested

Blocked:

- Live Gmail mailbox validation.
- Live Microsoft 365 mailbox validation.

Not covered by an automated test, though the code path exists:

- Accepting an invitation after `expires_at` has passed.
- Browser download of another organization's attachment.
- Browser attempt to change a role without administrator rights.
- Browser attempt to open another organization's mailbox screen.
- A job reaching `dead` after the maximum attempts. Retry and recovery after a simulated failure are tested.
- Mention notifications in the browser. Mention parsing is unit-tested.

## 13. Static analysis

`npx eslint .` — exit 0, no errors and no warnings, using `eslint-config-next` core-web-vitals and typescript.

`npm audit --json` — exit 1. Metadata: 5 high, 0 critical, 0 moderate, 0 low. All five are the `braces` advisory GHSA-vfj7-8cjw-p6xm through `eslint-config-next` (development only). The audit's available fix is a downgrade to `eslint-config-next` 14.2.35, which is not compatible with this Next.js version. Left unfixed and recorded in `docs/KNOWN_ISSUES.md`.

## 14. TypeScript

`npx tsc --noEmit --pretty false` — exit 0, about 139 seconds, after the origin check and logout test were added. `npx next build` also reported "Finished TypeScript" with no type errors.

## 15. Production build

`npx next build` — exit 0. Next.js 16.4.1 (Turbopack) compiled successfully, finished TypeScript, and generated 8 static pages plus the dynamic console routes. Warning only: `middleware.ts` is deprecated in favor of `proxy`. The build still lists `ƒ Proxy (Middleware)`.

## 16. Database migration result

`001` through `006` applied on the development database and on `klumail_test`. Integration tests truncate and reuse the test database. A brand-new cluster is created by `npm run db:up` when `data/postgres` is absent.

## 17. Tenant isolation results

Pass for the paths that were executed.

- As organization B, `SELECT` of organization A's ticket id returned no rows under the app role.
- `getTicket` and `updateTicketStatus` for that id threw a forbidden/not-found application error.
- Playwright, signed in as a second organization, searched for the first organization's subject and received `total: 0`.
- An agent `GET /api/reports/tickets.csv` returned 403 in the browser and in the integration test.

Organization ids from the browser are not treated as authorization. The session user and membership decide the actor, and RLS still filters rows.

## 18. Security findings

No open critical or high defect in the application paths that were tested.

Fixed during this phase:

- Direct notification inserts failed RLS when notifying another member. Inserts now go through `create_notification`.
- Cookie mutations compare the `Origin` host with the `Host` header and with the request URL host. A cross-site origin is rejected. Same-site `127.0.0.1` versus an internal `localhost` request URL is accepted.
- Audit inserts no longer bind one parameter as both uuid and text.

Remaining notes are in `docs/KNOWN_ISSUES.md`. Service-role and auth URLs are server-only. `.env.local` is gitignored. Attachment bytes under `data/attachments` are outside `pg_dump`.

## 19. Open-source repositories reviewed

Chatwoot (MIT Expat for the non-enterprise tree; `enterprise/` separate; GitHub SPDX `NOASSERTION`), FreeScout (AGPL-3.0), Zammad (AGPL-3.0), Open HelpDesk (AGPL-3.0 outside `ee/`). Licenses were taken from the repositories. Details are in `docs/OPEN_SOURCE_ATTRIBUTION.md`.

## 20. Code actually reused

None. No files were vendored or copied from those repositories.

## 21. License and attribution status

Application code in this directory is original. AGPL projects were used as reading material only. Dependency licenses are the published licenses of the packages in `package-lock.json`.

## 22. Known limitations

- Mock mail is not proof of Gmail or Microsoft 365.
- Password reset and verification mail stay in `system_emails` and `/dev/outbox` unless SMTP is configured. `/dev/outbox` is development and localhost only.
- Saved views can be stored. The inbox UI uses the standard views and query filters.
- Bulk update exists on the API for managers and administrators. The inbox has no bulk-selection toolbar.
- Local attachment files and the local Postgres data directory are gitignored and are not included in a database dump.

## 23. Outstanding defects

No failing automated test. The ESLint transitive advisory and the untested cases in section 12 are outstanding limitations, not failing product tests.

## 24. Deployment instructions

1. Provision PostgreSQL and create the three roles from `docs/SECURITY.md`.
2. Set the environment variables listed below. Do not commit the values.
3. `npm ci`
4. `npm run db:migrate` with `DATABASE_ADMIN_URL`.
5. `npm run build` and `npm start`.
6. Run `npm run worker` as a separate process.
7. Put the app behind HTTPS and set `APP_ENV=production`. The mock provider then refuses to connect.

## 25. Environment variable names

`APP_ENV`, `APP_URL`, `DATABASE_ADMIN_URL`, `DATABASE_URL`, `DATABASE_WORKER_URL`, `DATABASE_AUTH_URL`, `TEST_DATABASE_ADMIN_URL`, `TEST_DATABASE_URL`, `TEST_DATABASE_WORKER_URL`, `TEST_DATABASE_AUTH_URL`, `APP_ENCRYPTION_KEY`, `WORKER_SECRET`, `BCRYPT_ROUNDS`, `SYNC_INITIAL_DAYS`, `PG_BIN`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `GOOGLE_PUBSUB_TOPIC`, `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_REDIRECT_URI`, `MICROSOFT_TENANT`, `MICROSOFT_WEBHOOK_URL`, `SEED_DEMO`.

## 26. Connecting real email providers

Gmail: create an OAuth client with the redirect URI in `GOOGLE_REDIRECT_URI`. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. Scopes used by the adapter are `openid`, `email`, `https://www.googleapis.com/auth/gmail.readonly`, and `https://www.googleapis.com/auth/gmail.send`. Optional push uses `GOOGLE_PUBSUB_TOPIC`. Without it, sync is polling.

Microsoft 365: register an application and set `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_REDIRECT_URI`, and optionally `MICROSOFT_TENANT` and `MICROSOFT_WEBHOOK_URL`. Scopes used are `offline_access`, `openid`, `email`, `User.Read`, `Mail.Read`, and `Mail.Send`. Without a webhook URL, sync is polling.

In the product, an organization administrator opens Mailboxes, chooses the provider and a team, and completes the provider's consent screen. A provider is not production-ready until that flow has been run against a real mailbox.

## 27. Backup and recovery

`pg_dump` the application database. Restore with `pg_restore` or `psql` into an empty database, then run `npm run db:migrate`. Practice the restore on a copy. Also copy `data/attachments` and any uploaded logos under `data/branding`; those files are not inside the database dump. Disconnecting a mailbox does not delete tickets. Phase 1 does not auto-delete customer mail.

## 28. Acceptance checklist

| Criterion | Result |
| --- | --- |
| Registration, login, and session cookie | PASS — Playwright and integration |
| Password reset does not reveal whether the email exists | PASS — integration |
| Reset and verification tokens are single use | PASS — integration |
| Logout revokes the session | PASS — integration |
| Unauthenticated console routes redirect to login | PASS — middleware; exercised when the browser journey hits protected pages after login |
| Organization create, team, invitation, agent accept | PASS — Playwright |
| Invitation expiry | NOT TESTED |
| Role difference for CSV export | PASS — agent receives 403 |
| Ticket create from simulated mail, no duplicate on the tested ingest path | PASS — integration repeats sync; Playwright injects once |
| Status in progress, resolved, reopen, history retained | PASS — Playwright and integration |
| Pending and closed transition rules | PASS — unit tests; not every status was clicked in the browser |
| Internal note visible and not sent as a customer reply | PASS — Playwright shows the note; send path is a separate reply action |
| Reply accepted by the mock provider | PASS — Playwright text "Accepted by mailbox" |
| Outbound message is not a new customer ticket | PASS — integration |
| Failed sync is visible and a later attempt recovers | PASS — integration, mock token refresh |
| Search stays inside the organization | PASS — Playwright `total` 0 for the other organization |
| Dashboard figures come from SQL | PASS — integration totals; Playwright renders the queue from the database |
| Cross-organization ticket read and status update | PASS — integration |
| Cross-organization attachment download in the browser | NOT TESTED |
| Live Gmail | BLOCKED |
| Live Microsoft 365 | BLOCKED |
| TypeScript during production build | PASS |
| Lint | PASS |
| Production build | PASS |
| Migrations on dev and test databases | PASS |
| Dependency audit clean | FAIL as an audit command (exit 1). Findings are the development-only `braces` advisory. Not treated as a product defect in the runtime app. |

## 29. Readiness recommendation

Accept Phase 1 as the operational foundation and the mock-provider proof of the mailbox workflow. Do not treat Gmail or Microsoft 365 as production-validated until the steps in section 26 have been run against real mailboxes. Do not start Phase 2 until that review decision is explicit.

## Commands and results

| Command | Result |
| --- | --- |
| `npx eslint .` | exit 0 |
| `npx vitest run --reporter=verbose` | 21 passed, 0 failed, exit 0 |
| `npx next build` | exit 0 |
| `npx playwright test` | 1 passed, 0 failed, exit 0 |
| `npm audit --json` | exit 1, 5 high, 0 critical, development ESLint chain |
| `npx tsc --noEmit --pretty false` | exit 0 |
| `npx tsx scripts/migrate.ts` | applied `006_create_notification.sql` to both databases during the last migration run; earlier files were already applied |
