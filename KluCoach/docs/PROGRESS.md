# Progress

Updated: 2026-09-02 (Phase 5 COMPLETE — Billing, Subscriptions & Partner Economics)

Validation rule: COMPLETE only with execution evidence.

| Feature | Status | Tests | Verified | Notes |
|---------|--------|-------|----------|-------|
| Phase 4 checkpoint `b55d86d` | VALIDATED | n/a | git | Start of Phase 5 |
| SubscriptionPlan + snapshots | VALIDATED | vitest | yes | Configuration, not hard-coded ₹999 |
| TenantSubscription lifecycle | VALIDATED | vitest + playwright | yes | asOf computes EXPIRED |
| StudentEntitlement | VALIDATED | vitest | yes | EntitlementService |
| Demo NON_BILLABLE | VALIDATED | playwright | yes | Academic journeys still pass |
| Institution invoices + lines | VALIDATED | vitest + playwright | yes | Idempotent issue |
| Manual payment + refund | VALIDATED | vitest | yes | totalPaise immutable |
| Partner economics | VALIDATED | vitest + playwright | yes | Super-admin report + CSV |
| Parent fee card | VALIDATED | playwright | yes | Pending ₹24,000; no KluNex split |
| Cross-tenant billing | VALIDATED | vitest + playwright | yes | 404 |
| Payment gateway | NOT IMPLEMENTED | n/a | n/a | MANUAL records only |

## Phase 5 exit checklist

- [x] Plans, snapshots, subscriptions, entitlements, EntitlementService
- [x] Lifecycle + grace (documented; apply is callable)
- [x] Billable rule, invoices, lines, payments, refunds
- [x] Partner economics, DIRECT vs PARTNER, renewal snapshot
- [x] Parent fees, institution billing, super-admin report
- [x] Isolation, RBAC, immutability, idempotency, pricing tests
- [x] Playwright institution / parent fee / asOf / multi-tenant
- [x] Phase 4 journeys still pass
- [x] Vitest 74/74, Playwright 21/21, typecheck, build, lint
- [x] BILLING.md + ADR-013
- [x] Git tree clean (KluCoach paths; docs SHA `95c788f`)

## Session summary (Phase 5)

1. **Starting commit:** `b55d86d`
2. **Ending commit:** `95c788f` (`docs: document billing and subscription architecture`)
3. **Subscription architecture:** VALIDATED — plan catalog + tenant snapshot + statuses
4. **Pricing:** VALIDATED — integer paise; 100/1000 student cases from snapshot
5. **Student entitlement:** VALIDATED — EntitlementService; NON_BILLABLE demo bypass is explicit
6. **Billable students:** VALIDATED — ACTIVE + entitlement; SQL count
7. **Invoices:** VALIDATED — issued + paid demo rows; line items
8. **Payments:** VALIDATED — MANUAL SUCCESS; no gateway
9. **Partner economics:** VALIDATED — report totals from snapshots × count
10. **Renewal:** IMPLEMENTED — `POST /billing/subscriptions/renew` writes a new snapshot
11. **Grace:** VALIDATED — 7-day default from config; asOf GRACE/EXPIRED
12. **Parent fees:** VALIDATED — Paid/Pending on Student 360
13. **Institution billing:** VALIDATED — plan, status, billable, invoices
14. **Super-admin report:** VALIDATED
15–17. Isolation / RBAC / idempotency: VALIDATED
18. **Vitest:** 74/74 PASS
19. **Playwright:** 21/21 PASS
20. **Typecheck:** PASS
21. **Build:** PASS
22. **Lint:** `pnpm lint` `--if-present` no-op PASS
23. **Security:** no client-trusted institutionId; no card data
24. **Blocked tests:** none
25. **Docs:** BILLING.md, ADR-013, PROGRESS, ARCHITECTURE, TESTING, ROADMAP, DECISIONS
26. **Payment gateway:** NOT IMPLEMENTED
27. **Remaining:** live collection, webhooks, proration, job-runner lifecycle
28. **Exact next phase:** **Production readiness + real payment collection**
