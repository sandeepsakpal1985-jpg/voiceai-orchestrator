# KluConnect Rebrand Audit

> Generated: June 21, 2026 | Sprint: KluConnect Rebrand & Pilot Launch

## Summary

User-facing brand **MetaPilot AI** / **MetaPilot** replaced with **KluConnect** across frontend, emails, Swagger, and transactional copy. Internal codename **MetaPilot** retained in code comments, npm package names (`@socialpilot/*`), and sparse internal logs.

---

## Before → After (User-Facing)

| Location | Before | After |
|----------|--------|-------|
| `packages/shared/src/constants/index.ts` | `APP_NAME = 'MetaPilot AI'` | `APP_NAME = 'KluConnect'` |
| `frontend/src/app/layout.tsx` | MetaPilot AI title | KluConnect — Turn Every Comment Into A Customer |
| `frontend/src/app/page.tsx` | MetaPilot landing | Full KluConnect SaaS landing |
| `frontend/src/app/(auth)/login/page.tsx` | Sign in to MetaPilot AI | Sign in to KluConnect |
| `frontend/src/app/(auth)/register/page.tsx` | Hire your AI employee | Start your free trial |
| `frontend/src/app/(dashboard)/DashboardShell.tsx` | MetaPilot sidebar | KluConnect logo + tagline |
| `frontend/src/components/DemoBanner.tsx` | Demo Mode — {company} | You are viewing a demo workspace |
| `frontend/src/components/CeoHeroCard.tsx` | MetaPilot revenue | KluConnect revenue |
| `frontend/src/components/BrandEditor.tsx` | Hide MetaPilot Branding | Hide KluConnect Branding |
| `backend/src/app.ts` | MetaPilot AI API (Swagger) | KluConnect API |
| `backend/src/modules/auth/routes.ts` | MetaPilot email subjects | KluConnect email subjects |
| `backend/src/services/email/email-service.ts` | MetaPilot FROM + footer | KluConnect FROM + footer |
| `backend/src/modules/partners/*` | MetaPilot partner emails | KluConnect partner emails |
| `backend/src/services/reports/report-generator.ts` | MetaPilot footer | KluConnect footer |

---

## Intentionally Unchanged (Internal)

| Item | Reason |
|------|--------|
| npm packages `@socialpilot/*` | Internal; rename not trivial |
| File header comments `MetaPilot AI —` | Internal codename per sprint spec |
| `backend/src/__tests__/e2e-pipeline.test.ts` | Test fixture data, not user-facing |
| `backend/prisma/seed.ts` console logs | Dev-only internal logs |
| Database / env var names | No migration needed |

---

## Remaining MetaPilot References (Non-User-Facing)

~40 files contain `MetaPilot` in code comments or internal module headers. These are acceptable per sprint constraints.

No user-facing `SocialPilot` strings found in `.ts/.tsx/.css/.html` frontend files.

---

## New Brand Assets

| File | Purpose |
|------|---------|
| `frontend/public/branding/logo.svg` | Full wordmark |
| `frontend/public/branding/logo-mark.svg` | Sidebar / favicon mark |
| `frontend/public/branding/favicon.svg` | Browser tab icon |
