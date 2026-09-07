# Phase 11 plan

Turn the Phase 10 **controlled pilot-ready** checkpoint (`3ef2df4`) into something an institute can **onboard, operate, and measure**. Not a feature phase.

GPS, SafeTrack 9B, chat, advanced AI, RAG, and new academic modules stay on [ROADMAP.md](./ROADMAP.md).

## In scope

| Work | Approach |
|------|----------|
| Admin onboarding checklist | Live counts from Postgres; no fake progress |
| Bulk import | Row cap, email/phone checks, preview error truncation; keep transaction commit |
| Parent activation | Existing invite/accept; surface invitation stats on pilot metrics |
| Notification preferences | Existing API; parent/teacher UI; suppression tests |
| Institution billing | Invoice + list price only; KluNex/partner share super-admin only |
| Super-admin support view | Operational counts + last activity timestamp + existing commercial report; no student PII dump |
| SafeTrack 9A | Factual ENTRY/EXIT copy includes UTC clock time; no GPS |
| One Playwright pilot journey | Real UI/API against demo seed |
| Docs | Operations, metrics targets, feedback P0–P3, retention honesty |

## Out of scope

Wizards, CRM, analytics warehouse, live payments, SMS/WhatsApp, Kubernetes.
