# Progress

Updated: 2026-09-04 (Phase 7 — AI Student Insights & Assistant)

Validation rule: COMPLETE only with execution evidence. Statuses: IMPLEMENTED / VALIDATED / BLOCKED / NOT IMPLEMENTED.

| Feature | Status | Tests | Verified | Notes |
|---------|--------|-------|----------|-------|
| Phase 6 checkpoint `9edae95` | VALIDATED | n/a | git | Start of Phase 7 |
| AiProvider + TestAiProvider + OpenAI fetch adapter | VALIDATED | vitest | yes | No vendor SDK; no LangChain |
| AI_ENABLED default false | VALIDATED | vitest | yes | App boots with AI off; production rejects `test` |
| Student360AiContextBuilder | VALIDATED | vitest | yes | Minimized; no ids/emails/hashes |
| Parent / student / teacher / admin ask APIs | VALIDATED | vitest + playwright | yes | Authz before context |
| Citations from server context | VALIDATED | vitest + playwright | yes | Model does not invent evidence rows |
| Tenant / parent-child / sibling / teacher-batch isolation | VALIDATED | vitest + playwright | yes | Cross-tenant 404; super-admin denied |
| Prompt injection does not expand data | VALIDATED | vitest | yes | Unauthorized names never in context |
| Rate limits + input/output caps | VALIDATED | vitest | yes | 20/min production; 500-char message; 8000-char context |
| Disabled payload + provider 503 | VALIDATED | vitest + playwright (UI mock) | yes | No stack traces |
| Live OpenAI (or other vendor) | BLOCKED — EXTERNAL PROVIDER | n/a | no | Keys not present; CI uses TestAiProvider |

## Phase 7 exit checklist

- [x] AI provider abstraction implemented
- [x] AI disabled by default
- [x] Test AI provider implemented
- [x] Parent Student 360 AI implemented
- [x] Student self AI implemented
- [x] Teacher batch AI implemented
- [x] Admin institution AI implemented
- [x] Existing Student 360 remains canonical
- [x] No arbitrary database access from LLM
- [x] No model-generated SQL
- [x] Context builder authorization enforced
- [x] Tenant isolation tested (EXECUTED, PASSED)
- [x] Parent-child isolation tested (EXECUTED, PASSED)
- [x] Student-sibling isolation tested (EXECUTED, PASSED)
- [x] Teacher batch authorization tested (EXECUTED, PASSED)
- [x] Admin tenant isolation tested (EXECUTED, PASSED)
- [x] Prompt injection tests pass (EXECUTED, PASSED)
- [x] Rate limits implemented
- [x] Input/output limits implemented
- [x] AI errors safely handled
- [x] Provider failure tested (EXECUTED, PASSED)
- [x] AI disabled state tested (HTTP EXECUTED; Playwright UI via status mock EXECUTED)
- [x] Citations/evidence implemented
- [x] No unnecessary PII sent to model
- [x] No sensitive data logged (audit metadata is provider only)
- [x] Audit events implemented
- [x] Parent Playwright journey passes
- [x] Student Playwright journey passes
- [x] Teacher Playwright journey passes
- [x] Admin Playwright journey passes
- [x] Typecheck passes
- [x] Build passes
- [x] Vitest passes (113/113)
- [x] Playwright passes (29/29)
- [x] Documentation updated
- [x] Git tree clean
- [x] No critical/high security regression in executed suites
- [ ] Live provider — **BLOCKED — EXTERNAL PROVIDER**

## Session summary (Phase 7)

1. **Starting commit:** `9edae95`
2. **Ending commit:** `fc549f5` (`docs: document ai architecture`)
3. **AI capabilities implemented:** parent child insights, student self insights, teacher assigned-batch insights, institution-admin tenant insights; on-demand UI on existing Student 360 / batches / admin home
4. **AI capabilities validated:** TestAiProvider journeys EXECUTED and PASSED (Vitest + Playwright). Live vendor **BLOCKED — EXTERNAL PROVIDER**
5. **Security tests executed:** parent/sibling/tenant/teacher/admin/super-admin/prompt-injection/disabled/provider-failure
6. **Security tests passed:** yes (Vitest integration + Playwright tamper 404s)
7. **Vitest:** 113/113 PASS
8. **Playwright:** 29/29 PASS (24 Phase 6 + 5 AI)
9. **Typecheck:** PASS
10. **Build:** PASS
11. **Lint:** `pnpm lint` `--if-present` no-op PASS
12. **AI provider status:** `TestAiProvider` VALIDATED; OpenAI HTTPS adapter IMPLEMENTED unused without keys
13. **Tests blocked:** live LLM API — **BLOCKED — EXTERNAL PROVIDER**
14. **Known limitations:** no chat history; no RAG; no proactive notification insights; no tenant-level `aiEnabled` flag; Playwright `reuseExistingServer` must include `AI_ENABLED=true` and `AI_PROVIDER=test`
15. **Documentation updated:** AI.md, AI_PROVIDER_SETUP.md, ADR-018, SECURITY, PRIVACY, DATA_PROTECTION, ARCHITECTURE, ROADMAP, DECISIONS, TESTING, OPEN_SOURCE, PROGRESS
16. **Exact next phase:** **Stop.** Do not start Phase 8. The next interesting expansion is proactive factual insights through the existing notification system, only after this interactive layer is accepted.

Phase 7 software is **VALIDATED** against the test provider. Do not claim “AI works” against a live model until the optional procedure in [AI_PROVIDER_SETUP.md](./AI_PROVIDER_SETUP.md) is actually run.

## Phase 6 feature status

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
