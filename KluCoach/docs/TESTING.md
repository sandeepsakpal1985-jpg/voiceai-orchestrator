# Testing

## Rules

- A skipped test is not a passing test.
- “Code exists” is not “feature works.”
- Cross-tenant tests must execute.

## Layers

| Layer | Tool | What |
|-------|------|------|
| Unit | Vitest | RBAC policies, spreadsheet parse, student-import validation, rate-limit config, pricing/grace/invoice totals |
| Integration | Vitest + Postgres | auth, tenant isolation, invitation lifecycle, password reset, marks validation, teacher-batch denial, attendance upsert, timetable/assignment isolation, assignment submit-by-id, billing isolation/idempotency, payment checkout/webhooks, lifecycle job idempotency |
| E2E | Playwright | parent invitation, assessment marks, attendance save + parent view, assignment submit, timetable admin slot, smoke/notice, parent Student 360, multi-child switch, student own 360, parent absence/result notifications, multi-child notification context, student assignment notification, institution billing, parent fee status, subscription asOf expiry, multi-tenant billing 404, password reset, test-mode payment fail/success, subscription renew, parent/student/teacher/admin AI asks + isolation, AI disabled UI, parent/student proactive insights + isolation + job dedupe |
| AI | Vitest | provider port, TestAiProvider, context minimization, citations, prompt versions, disabled payload, provider 503, tenant/parent/sibling/teacher/admin isolation, prompt injection, rate-limit key |
| Proactive insights | Vitest + Playwright | attendance/academic decline and improvement rules, overdue assignments, thresholds, trivial-change skip, dedupe, worker/job idempotency, parent/student/teacher/admin/super-admin isolation, AI wording off, provider failure, prompt-injection copy rejected |
| SafeTrack movement | Vitest + Playwright | RFID ingest, duplicate scan, unknown card, parent entry notification, teacher/super-admin denied, tenant 404 |
| Payments | Vitest | Razorpay HMAC unit tests; checkout isolation; invalid signature 400; duplicate webhook; pending ≠ paid; refunds |
| Billing | Vitest | 100/1000 student economics from snapshot; invoice/payment/refund immutability; asOf expiry; super-admin report denial |
| Student 360 | Vitest | status engine unit tests; parent/student/teacher/admin authorization; empty-state student (created in-test); schema parse |
| Notifications | Vitest | list/get 404 isolation; recipient POST denied; absence/result/assignment/notice/timetable events; dedupe; mark-all-read; reminder stub; retention does not delete audit logs |

Phase 2 completion Playwright evidence (2026-09-01): **10/10 passed** — invitation activation, invalid token, assessment marks + parent result, attendance persist + parent view, assignment create/submit, timetable admin slot, plus smoke/notice.

Phase 2 Vitest evidence (2026-09-01): **48/48 passed** (previous 42 plus attendance upsert, timetable/session isolation, assignment submit isolation).

Phase 3 Vitest evidence (2026-09-01): **58/58 passed** (48 Phase 2 plus status engine and Student 360 authorization/empty-state integration).

Phase 3 Playwright evidence (2026-09-01): **13/13 passed** — Phase 2 ten workflows plus parent Student 360, multi-child switch + deny, student own 360.

Phase 4 Vitest evidence (2026-09-02): **63/63 passed** (58 Phase 3 plus 5 notification authorization/job tests). Empty-state coverage creates a student with no records rather than assuming Diya stays empty after attendance e2e.

Phase 5 Vitest evidence (2026-09-02): **74/74 passed** (63 Phase 4 plus pricing/lifecycle unit tests, billing isolation/idempotency, billing RBAC).

Phase 5 Playwright evidence (2026-09-02): **21/21 passed** — Phase 4 seventeen workflows plus institution billing, parent fee status, asOf expiry, multi-tenant billing 404.

Phase 6 Vitest evidence (2026-09-02): **90/90 passed** (74 Phase 5 plus config, Razorpay HMAC, password reset, payment webhooks, job idempotency, executed HTTP 429).

Phase 6 Playwright evidence (2026-09-02): **24/24 passed** — Phase 5 twenty-one workflows plus password reset, test-mode payment fail/success on `KC-2026-0001`, subscription renew. Live Razorpay sandbox E2E: **BLOCKED — EXTERNAL PROVIDER**.

Phase 7 Vitest evidence (2026-09-04): **113/113 passed** (90 Phase 6 plus AI unit/integration, config AI fail-fast, AI rate-limit key).

Phase 7 Playwright evidence (2026-09-04): **29/29 passed** — Phase 6 twenty-four workflows plus parent Aarav/Diya AI + tamper 404, student self vs sibling 404, teacher assigned batch vs tenant B 404, admin institution vs tenant B student 404, AI disabled UI (status mock). Live LLM: **BLOCKED — EXTERNAL PROVIDER**.

Phase 8 close-out evidence (2026-09-05): Vitest **131/131**. Playwright **33/33** including `assessment-marks` (independent re-run PASS; full suite PASS). Insight journeys include notification → Student 360 and foreign studentId/notificationId **404**. Live LLM wording: **BLOCKED — EXTERNAL PROVIDER**. See [PROGRESS.md](./PROGRESS.md).

Phase 9A evidence (2026-09-05): Vitest **137/137**. Playwright SafeTrack `access.spec.ts` **2/2**. Typecheck PASS. Full Playwright last complete run **32/35**; `attendance.spec` parent 360 date assertion fails independently on this demo DB (newest 8 attendance rows are later-dated e2e marks). See [PROGRESS.md](./PROGRESS.md).

Phase 10 evidence (2026-09-05): Vitest **141/141**. Playwright **35/35**. Typecheck PASS. Web Vite build PASS. Lint `--if-present` PASS (no package lint scripts). Attendance e2e uses `uniqueCalendarDate` and asserts the saved date on Attendance history + `GET /attendance?date=` (not the Student 360 newest-8 snippet). Production fail-fast: wildcard CORS, insecure cookies, `ALLOW_DEV_RESET_TOKEN`, demo seed refuse. Revoked RFID → `UNKNOWN_CARD`, no parent notify. Live Razorpay/SMTP/HTTPS/hardware remain blocked. See [PROGRESS.md](./PROGRESS.md).

Phase 11 evidence (2026-09-06): Vitest **152/152**. Playwright **36/36** including `e2e/pilot.spec.ts`. Typecheck PASS. Web Vite build PASS. Lint `--if-present` PASS. Adds admin onboarding checklist (`GET /dashboard/onboarding`), `GET /pilot/metrics` (super-admin), import row cap + email/phone validation (500/1,000 row unit tests), notification preference UI + suppression, institution billing without KluNex/partner share. Do not raise Student 360's 8-row attendance window to make tests pass. Live Razorpay/SMTP/HTTPS/hardware remain blocked. See [PROGRESS.md](./PROGRESS.md).

## Cross-tenant matrix

Tenant A must not access Tenant B via:

- path IDs
- query params
- request bodies
- search
- reports / CSV export

Expected: **404**

## Commands

```bash
pnpm test
pnpm test:integration
pnpm --filter @klucoach/web test:e2e
```

Evidence belongs in [PROGRESS.md](./PROGRESS.md). If the environment cannot run a suite, mark **BLOCKED — ENVIRONMENT**.
