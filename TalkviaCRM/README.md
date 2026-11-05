# KluCare hospital calling CRM (Talkvia)

Calling-floor CRM for KluCare: auto-queue one hospital, log calls, breaks, admin KPIs, outbound email via Google Workspace.  
**KluCRM** (Next.js SaaS under `KluCRM/`) stays as the alternate product.

| | Local | Production target |
|---|---|---|
| App | http://127.0.0.1:8080 | https://crm.klucare.com |
| Stack | PHP 8 + MariaDB | PHP 8 + MySQL/MariaDB + HTTPS |

## Sprint status

| Sprint | Status |
|---|---|
| A — Admin calling reports | **Complete** |
| B — Google Workspace email | **Software ready** — needs your mailbox + app password |
| C — Deploy crm.klucare.com | **Package ready** — needs DNS + hosting + DB |

**What we need from you:** [WAITING_ON_YOU.md](./WAITING_ON_YOU.md)

## Docs

- [SPRINT.md](./SPRINT.md) — board  
- [EMAIL_SETUP.md](./EMAIL_SETUP.md) — Workspace SMTP  
- [DEPLOY.md](./DEPLOY.md) — production upload  
- [TEST_RESULTS.md](./TEST_RESULTS.md) — last regression (40/40)

## Local demo

```powershell
.\start-local.ps1
```

| Role | Email | Password |
|---|---|---|
| Admin | `admin@talkvia.local` | `TalkviaAdmin1!` |
| Agent | `agent@talkvia.local` | `TalkviaAgent1!` |

Admin: pipeline, **Calling reports**, agents, **Email settings**, availability.  
Agent: auto-next hospital, save call & stay, dispose, break.

## Build production zip

```powershell
.\deploy\build-release.ps1
```

Zip lands in `deploy\dist\` (no secrets). Then follow `DEPLOY.md`.
