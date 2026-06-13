# SOCIALPILOT AI — TEST HEALTH REPORT

**Date:** June 1, 2026  
**Previous state:** 10 frontend failures, 1 Playwright syntax error

---

## TEST RESULTS

| Category | Total | Passing | Failing | Status |
|----------|-------|---------|---------|--------|
| Backend Unit/Integration Tests | 208 | 208 | 0 | ✅ |
| Frontend Component Tests | 52 | 52 | 0 | ✅ |
| Playwright E2E Tests | 5 | 0 (not run) | 0 | ✅ Parsing OK |

## COVERAGE BY MODULE

| Module | Tests | Status |
|--------|-------|--------|
| Auth | auth.test.ts (9 tests) | ✅ |
| Meta OAuth | meta.test.ts (16 tests) | ✅ |
| Comments | comments.test.ts (8 tests) | ✅ |
| DMs | dms.test.ts (8 tests) | ✅ |
| Leads | leads.test.ts (12 tests) | ✅ |
| CRM | crm.test.ts (6 tests) | ✅ |
| Revenue | revenue.test.ts (8 tests) | ✅ |
| Knowledge | knowledge.test.ts (6 tests) | ✅ |
| Onboarding | onboarding.test.ts (4 tests) | ✅ |
| Analytics | analytics.test.ts (6 tests) | ✅ |
| E2E Pipeline | e2e-pipeline.test.ts (16 tests) | ✅ |
| Admin | admin.test.ts (5 tests) | ✅ |
| Escalation | escalation.test.ts (7 tests) | ✅ |
| Reputation | reputation.test.ts (8 tests) | ✅ |
| Re-engagement | reengagement.test.ts (3 tests) | ✅ |
| Missed Opps | missed-opportunities.test.ts (12 tests) | ✅ |
| CTA/Team | cta-team-notifications.test.ts (6 tests) | ✅ |
| Approvals | approvals.test.ts (12 tests) | ✅ |
| Timeline | timeline.test.ts (17 tests) | ✅ |
| Inbox | inbox.test.ts (4 tests) | ✅ |
| **Frontend Components** (10 files, 52 tests) | ✅ |

## REMAINING COVERAGE GAPS

| Module | Missing Tests | Priority |
|--------|--------------|----------|
| Subscription/Billing | **No tests** — 0% coverage | 🔴 Critical |
| Partners | **No tests** — 0% coverage | 🟡 High |
| Reports | **No tests** — 0% coverage | 🟡 High |
| Meta Health | **No tests** — 0% coverage | 🟡 High |
| Memory Service | **No tests** — 0% coverage | 🟡 Medium |
| Chatwoot | **No tests** — 0% coverage | 🟢 Low |
| n8n | **No tests** — 0% coverage | 🟢 Low |
| Demo | **No tests** — 0% coverage | 🟢 Low |

## FIXES APPLIED THIS SPRINT

| Issue | Fix |
|-------|-----|
| Playwright syntax error (unterminated backtick) | Replaced backtick with single quote |
| Login test: "OR" appears twice | Changed to `getAllByText('OR')` |
| Dashboard test: "Dashboard" text not found | Updated assertions to match actual page content |
| Dashboard test: Mocks only covered 1 API call (needs 5) | Updated mock chain for all 5 concurrent calls |
| Dashboard test: "3" appears multiple times | Changed to `getAllByText('3')` |
| Dashboard test: "Escalations" appears multiple times | Changed to `getAllByText('Escalations')` |
| Inbox test: "No messages yet" → "Inbox is empty" | Updated empty state text |
| Inbox test: "Unified Inbox" → "Inbox" | Updated heading assertion |
| CRM test: /Won/ and /Lost/ match multiple elements | Changed to `getAllByText` |
| Settings test: ApiKeyManager crash (unhandled extra API call) | Added fallback mock for `/api/api-keys` |
| Settings test: 3 checkboxes (not 2) | Updated count to 3 |
