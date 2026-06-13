# MetaPilot AI — Suggestion Tracker

This file tracks all suggestions made to prevent repeating the same tasks.
Before suggesting any new task, check this file. If a task is already here, do not suggest it again.

## Rules

1. Before making new suggestions, read this file first
2. If a task has status ✅ COMPLETED or ❌ BLOCKED, do not suggest it again
3. Only suggest tasks with status 📋 PENDING
4. Mark tasks as ❌ BLOCKED if infrastructure/credentials prevent execution
5. Mark tasks as ✅ COMPLETED after successful execution
6. Append new tasks at the bottom with 📋 PENDING status

## Suggestion History

| # | Task | Status | Reason if Blocked |
|---|------|--------|-------------------|
| 1 | Deploy to Railway (railway login → link → up) | ❌ BLOCKED | Needs interactive browser login or RAILWAY_API_TOKEN — not available in this CLI environment |
| 2 | Run Playwright E2E tests (docker compose up → npx playwright test) | ❌ BLOCKED | Docker not installed on this Windows system — cannot start PostgreSQL/Redis stack |
| 3 | Rebrand remaining SocialPilot references | ✅ COMPLETED | 22+ references fixed across demo/ files + deploy/setup-ssl.sh. Zero SocialPilot refs remain in .ts/.tsx source files |
| 4 | Fix frontend dashboard tests (6th API call missing from mock) | ✅ COMPLETED | Added /api/meta-insights/followers mock. 52 frontend + 208 backend tests all pass |
| 5 | Add backend integration tests for untested modules (subscription, demo, settings, automation, meta-health, reports) | ✅ COMPLETED | Created 6 new test files with 33 tests. Fixed cleanDatabase() in setup.ts (added 8 missing models). All 255 backend + 52 frontend tests pass |
| 6 | Add frontend component tests for untested pages | ✅ COMPLETED | 5 new test files created (approvals, billing, health, reputation, success). 37 new tests total. 89 frontend tests all pass |
| 7 | TypeScript strict mode audit | ✅ COMPLETED | Both backend and frontend already have strict: true enabled |
| 8 | Fix dashboard test (6th API call missing from mock) | ✅ COMPLETED | Dashboard tests now 52/52 passing |
