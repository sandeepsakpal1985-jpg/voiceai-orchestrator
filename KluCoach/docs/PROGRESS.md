# Progress

Updated: 2026-09-02 (Phase 6 — Production Readiness + Real Payment Collection)

Validation rule: COMPLETE only with execution evidence. Statuses: IMPLEMENTED / VALIDATED / BLOCKED / NOT IMPLEMENTED.

| Feature | Status | Tests | Verified | Notes |
|---------|--------|-------|----------|-------|
| Phase 5 checkpoint `f3497b3` | VALIDATED | n/a | git | Start of Phase 6 |
| APP_ENV + fail-fast config | VALIDATED | vitest | yes | Secrets never in `/health` |
| Password reset | VALIDATED | vitest + playwright | yes | Hashed token, generic message |
| Production rate-limit ceilings | VALIDATED | vitest | yes | HTTP 429 executed on a 1-request Fastify app |
| PaymentProvider + Razorpay HTTPS | IMPLEMENTED | vitest | yes (HMAC unit) | No Razorpay SDK types in domain |
| Test payment provider + webhooks | VALIDATED | vitest | yes | Signature, idempotency, pending ≠ paid |
| Live Razorpay sandbox checkout | BLOCKED — EXTERNAL PROVIDER | n/a | no | Keys not present in this environment |
| PAYMENTS_ENABLED cutover | VALIDATED | vitest | yes | Defaults false; production rejects `test` provider |
| Refunds (provider when id exists) | VALIDATED | vitest | yes | Super-admin; separate BillingRefund row |
| Reconciliation | VALIDATED | vitest | yes | Report rows; no silent history rewrite |
| Lifecycle worker + job table | VALIDATED | vitest | yes | Hour-key idempotency |
| EmailTransport (SMTP / memory) | IMPLEMENTED | vitest (memory) | yes | Live SMTP **NOT CONFIGURED** |
| StorageProvider local + S3 SigV4 | IMPLEMENTED | typecheck | yes | S3 not exercised against a bucket |
| Health / ready / request IDs | VALIDATED | vitest + typecheck | yes | Production errors omit stack traces |
| Backup restore drill | VALIDATED | docker exec | yes | `pg_dump` → `klucoach_restore_check` → 2 institutions → `RESTORE_VERIFIED` |
| Production Docker API image | VALIDATED | docker build | yes | `klucoach-api:phase6`, USER `klucoach` |
| Live HTTPS host | BLOCKED — INFRASTRUCTURE | n/a | no | Caddyfile present; no public cert issued here |
| Playwright production journeys | VALIDATED | playwright | yes | See session summary |

## Phase 6 exit checklist

- [x] Production env separated (`APP_ENV`); fail-fast validator; secrets not in health
- [x] Password reset + hashed tokens + generic response + audits
- [x] Production rate-limit ceilings documented and 429 executed in Vitest
- [x] HTTPS reverse-proxy config (Caddy/nginx) — live cert **BLOCKED — INFRASTRUCTURE**
- [x] PaymentProvider + Razorpay HMAC; `PAYMENTS_ENABLED` defaults false
- [x] Order creation, webhook signature, webhook idempotency (Vitest)
- [x] Duplicate callback test
- [x] Invoice reconciliation
- [x] Refunds (super-admin; provider call when payment id exists)
- [x] Lifecycle worker + hour-key idempotency
- [x] EmailTransport production-ready (SMTP when configured; memory in tests)
- [x] Structured logs, request IDs, health, ready
- [x] `prisma migrate deploy` (not db push) documented
- [x] Backup restore actually tested (`RESTORE_VERIFIED`, 2 institutions)
- [x] Production API Docker image builds as non-root `klucoach`
- [x] Deployment + rollback + incident docs
- [x] Tenant isolation and billing authorization still in Vitest
- [x] Playwright critical production workflows (reset, pay, renew) plus prior journeys
- [ ] Live Razorpay sandbox checkout — **BLOCKED — EXTERNAL PROVIDER**
- [ ] Public HTTPS host — **BLOCKED — INFRASTRUCTURE**
- [ ] Enable `PAYMENTS_ENABLED=true` in production — explicit cutover, not automatic

## Session summary (Phase 6)

1. **Starting commit:** `f3497b3`
2. **Ending commit:** `dba3d06` (`docs: record phase 6 production readiness`)
3. **Features implemented:** production config, password reset, Razorpay provider abstraction, verified webhooks, reconciliation, lifecycle worker, email/storage ports, observability, Compose/Caddy, backup drill, Docker image
4. **Features validated:** Vitest 90/90; backup restore; API image USER klucoach; Playwright production journeys (see below)
5. **Vitest:** 90/90 PASS
6. **Playwright:** 24/24 PASS (21 Phase 5 + password reset + test payment fail/success + subscription renew)
7. **Typecheck:** PASS
8. **Build:** PASS
9. **Lint:** `pnpm lint` `--if-present` no-op PASS
10. **Security:** reset tokens hashed; webhooks signed; amounts from stored invoices; production errors omit stacks; 429 executed
11. **Payment provider:** Razorpay HTTPS + HMAC IMPLEMENTED; live sandbox **BLOCKED — EXTERNAL PROVIDER**
12. **Webhooks:** signature + idempotency VALIDATED (test provider)
13. **Backup/restore:** VALIDATED (`RESTORE_VERIFIED`)
14. **Production deployment:** image VALIDATED; live VPS/TLS **BLOCKED — INFRASTRUCTURE**
15. **Tests blocked:** live Razorpay checkout; public HTTPS cookie check
16. **Known risks:** test provider is forbidden in production; overdue seed invoices after lifecycle jobs; Playwright `reuseExistingServer` must have payment env flags
17. **Remaining:** Razorpay keys + HTTPS host + SMTP + object storage bucket + explicit payment cutover; GST legal review
18. **Exact next phase:** **Phase 7 — AI capabilities** (only after the production cutover is accepted). Do not start AI in this phase.

Phase 6 software is **IMPLEMENTED** with local executed evidence. Do not treat the product as live-money-ready until Razorpay live/sandbox keys, HTTPS, and `PAYMENTS_ENABLED=true` are configured on a real host.

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
