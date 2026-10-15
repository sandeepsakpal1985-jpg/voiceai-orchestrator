# KluMail

Multi-tenant customer support email platform. Phase 1 is the operational product: accounts, organizations, teams, tickets, conversations, simulated and production mailbox adapters, search, dashboards, notifications, and organization settings.

Phase 2 features (AI replies, sentiment, SLA timers, FCR, quality scores, live chat, WhatsApp, voice, and enterprise billing) are not implemented. The `domain_events` table is only an extension point.

## Stack

- Next.js App Router, React, TypeScript
- PostgreSQL with row-level security
- Application sessions (Supabase Auth is the intended production host when a project is configured; this repository does not ship fake Supabase credentials)
- Gmail API and Microsoft Graph adapters, plus a clearly labeled mock provider for development and tests

## Local setup

PostgreSQL 16 is required. The app can start a project-local cluster on `127.0.0.1:5433` so it does not change the system cluster.

```powershell
npm install
npm run db:up
npm run db:migrate
npm run dev
```

Copy `.env.example` only as a reference. `npm run db:up` writes `.env.local` with generated local passwords when that file is missing. Do not commit `.env.local` or `data/`.

Set `SEED_DEMO=true` and run `npm run db:seed` to insert a labeled development organization. The seed refuses to run when `APP_ENV=production`.

## Checks

```powershell
npm run typecheck
npm run lint
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

`npm test` uses the `klumail_test` database. `npm run test:e2e` starts the app on `http://127.0.0.1:3100` and uses the development database.

Background sync and sending also run when a request enqueues a job. For a separate process:

```powershell
npm run worker
```

## Mailbox providers

The mock provider is for development and automated tests. It is refused when `APP_ENV=production`. Gmail and Microsoft 365 are implemented against the official APIs and stay inactive until their client credentials are set. See `docs/SECURITY.md` and `docs/PHASE_1_SIGNOFF.md`.
