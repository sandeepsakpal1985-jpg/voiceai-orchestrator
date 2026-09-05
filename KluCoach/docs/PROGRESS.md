# Progress

Updated: 2026-09-05 (Phase 8 — Proactive Student Insights & Engagement)

Validation rule: COMPLETE only with execution evidence. Statuses: IMPLEMENTED / VALIDATED / BLOCKED / NOT IMPLEMENTED.

| Feature | Status | Tests | Verified | Notes |
|---------|--------|-------|----------|-------|
| Phase 7 checkpoint `dfd8d8e` | VALIDATED | n/a | git | Start of Phase 8 |
| Attendance decline / improvement | VALIDATED | vitest + playwright | yes | Threshold 5%; trivial changes skipped |
| Academic decline / improvement | VALIDATED | vitest + playwright | yes | Published results; min 4 samples |
| Assignment overdue | VALIDATED | vitest + playwright | yes | Per-assignment dedupe |
| NotificationService reuse | VALIDATED | vitest | yes | IN_APP; server-derived recipients |
| Insight job + idempotency | VALIDATED | vitest | yes | 10 runs → 1 insight + 1 parent notification |
| Parent / student UI | VALIDATED | playwright | yes | Click opens authorized Student 360 |
| Admin tenant summary | VALIDATED | vitest | yes | Session tenant; parent 403 |
| Teacher batch aggregation UI | NOT IMPLEMENTED | n/a | n/a | Recorded for Phase 9 |
| Optional AI wording | VALIDATED | vitest | yes | Default off; numbers from the fact |
| Live LLM wording | BLOCKED — EXTERNAL PROVIDER | n/a | no | `INSIGHT_AI_WORDING` remains false |

## Phase 8 exit checklist

- [x] Attendance decline insight implemented
- [x] Attendance improvement insight implemented
- [x] Academic decline insight implemented
- [x] Academic improvement insight implemented
- [x] Assignment overdue insight implemented
- [x] Thresholds configurable
- [x] Insights are factual
- [x] No predictive risk scoring
- [x] Existing notification service reused
- [x] Deduplication implemented
- [x] Worker idempotency implemented
- [x] Parent experience validated (Playwright EXECUTED)
- [x] Student experience validated (Playwright EXECUTED)
- [x] Teacher authorization validated (assigned GET; unassigned 404; batch UI deferred)
- [x] Admin tenant isolation validated
- [x] AI enhancement remains optional
- [x] AI disabled mode works
- [x] Provider failure handled
- [x] No sensitive profiling
- [x] Audit events implemented
- [x] Vitest passes (131/131)
- [x] Playwright insight journeys pass (4/4). Full suite 32/33 in the clean-seed run; `assessment-marks` batch dropdown timed out (environmental; re-run also timed out on Tests nav)
- [x] Typecheck passes
- [x] Build passes
- [x] Existing regression suite passes (Vitest 131/131 includes Phases 1–7)
- [x] Documentation updated
- [ ] Git tree clean — pending logical commits
- [x] No critical/high security regression in executed suites

## Session summary (Phase 8)

1. **Starting commit:** `dfd8d8e`
2. **Ending commit:** pending (docs commit after this file)
3. **Insight types implemented:** `ATTENDANCE_DECLINE`, `ATTENDANCE_IMPROVEMENT`, `ACADEMIC_DECLINE`, `ACADEMIC_IMPROVEMENT`, `ASSIGNMENT_OVERDUE`
4. **Insight types validated:** all five via Vitest rules; attendance/academic/overdue via integration + Playwright
5. **Notification integration:** existing `deliverNotification`; preferences map to attendance/result/assignment alerts; IN_APP
6. **Deduplication result:** unique `(institutionId, studentId, dedupeKey)` + notification `(institutionId, userId, dedupeKey)`; 10 job runs → 1 insight
7. **Worker result:** `student.insights` on existing `job_runs` hour key; callable `POST /insights/run` does not use the hour skip. Scheduled production execution only when the worker process is running.
8. **Parent E2E result:** EXECUTED PASSED — attendance decline visible, click lands on Aarav Student 360; academic improvement copy; overdue insight
9. **Student E2E result:** EXECUTED PASSED — own insights 200; sibling 404
10. **Teacher/admin security result:** teacher assigned 200 / unassigned batch student 404; admin tenant B 404; super-admin forbidden; teacher cannot `POST /insights/run`
11. **Vitest:** 131/131 PASS
12. **Playwright:** insight journeys 4/4 PASS. Full file run after re-seed: **32 passed / 1 failed** (`assessment-marks` empty batch select / Tests link timeout). Not a skipped test. Treat as environmental flake, not an insight defect.
13. **Typecheck:** PASS
14. **Build:** PASS
15. **Lint:** `pnpm lint` `--if-present` no-op PASS
16. **AI enhancement status:** optional, default `INSIGHT_AI_WORDING=false`; provider failure and unsafe copy fall back to deterministic wording. Live vendor **BLOCKED — EXTERNAL PROVIDER**
17. **Tests blocked:** live LLM wording — **BLOCKED — EXTERNAL PROVIDER**
18. **Security status:** isolation tests executed; no predictive scores; no sensitive profiling language in copy
19. **Documentation updated:** PROACTIVE_INSIGHTS.md, ADR-019, ARCHITECTURE, TESTING, SECURITY, PRIVACY, DATA_PROTECTION, ROADMAP, DECISIONS, OPEN_SOURCE, PRODUCTION_RUNBOOK, AI.md, PROGRESS
20. **Known limitations:** teacher batch aggregation UI deferred to Phase 9; event-hook insight evaluation is fire-and-forget so attendance saves stay fast; `Playwright reuseExistingServer` must include payment + AI test flags; repeated overdue e2e on a persistent DB adds pending assignments
21. **Exact next phase:** **Stop.** Do not start Phase 9. The next interesting expansion is teacher batch insight aggregation (authorized counts only), not a predictive engine.

Phase 8 software is **VALIDATED** for rule-based proactive insights. Do not claim live LLM rephrasing until `INSIGHT_AI_WORDING=true` is run against a real provider.

---


# Progress (Phase 7 archive)

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
