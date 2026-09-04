# Security

KluCoach processes student and children's data. Security is a product requirement, not a later pass.

---

## Trust boundaries

Never trust from the client:

- tenant / institution ID
- student ID as “this is my child” without a server-side link check
- parent ID
- role
- permission flags

Identity, tenant, and role come from the **server session**. Resource IDs in URLs/bodies are untrusted handles: load the row, then assert `institutionId === session.institutionId` and RBAC/relationship.

---

## Authentication

- Argon2id password hashing
- Server-side sessions stored in PostgreSQL
- httpOnly, Secure (production), SameSite=Lax cookies
- CSRF protection on cookie-authenticated state-changing requests
- Session rotation on login
- Logout deletes the server session
- Rate limit login, registration, invitation, password reset, payment initiation, and AI asks
- Password reset: generic response whether or not the email exists; SHA-256 hashed single-use tokens with expiry; all reset tokens and sessions invalidated on completion. Never store the raw token. Audit `auth.password_reset.requested` / `.completed` without tokens or passwords.

Production rate limits (in-process `@fastify/rate-limit`; no Redis):

| Endpoint | Max | Window | Rationale |
|----------|-----|--------|-----------|
| `POST /auth/login` | 10 | 1 minute | Credential stuffing |
| `POST /auth/register` | 5 | 1 minute | Institution spam |
| `POST /auth/invitations/accept` | 10 | 1 minute | Token guessing |
| `POST /invitations` | 20 | 1 minute | Invite flood |
| `POST /auth/password-reset/request` and complete | 5 | 1 minute | Token guessing |
| `POST /billing/invoices/:id/pay` | 10 | 1 minute | Checkout abuse |
| `POST /ai/students/:id/ask`, `/ai/batches/:id/ask`, `/ai/institution/ask` | 20 | 1 minute | Model cost; keyed by tenant + user after session bind |
| `POST /imports/students/preview` | 20 | 1 minute | Parse CPU |
| Global (other routes) | 300 | 1 minute | Generic abuse |
| `/health`, `/ready`, `/webhooks/*` | allow-listed | — | Probes and provider retries |

HTTP 429 was executed in Vitest against a Fastify app with `max: 1` (`rateLimits.test.ts`). Production ceilings are asserted as numbers. Live production 429 against a public host is **BLOCKED — INFRASTRUCTURE**.

Vitest uses a 10_000 ceiling so isolation suites do not 429. Phase 1 gate: [SECURITY_GATE_PHASE1.md](./SECURITY_GATE_PHASE1.md).

---

## Authorization

Central policy module. No scattered `if (role === 'ADMIN')` in routes.

Teachers: only batches/students they are assigned to, unless institution admin.

Parents: only linked students via `StudentGuardian`.

Students: only self.

---

## Tenant isolation

Every tenant-owned table has `institutionId`. Services always filter by session tenant. Cross-tenant tests must execute and pass (a skipped test is not a pass).

Failed cross-tenant access returns **404** (do not confirm the other tenant's resource exists). SUPER_ADMIN platform routes are separate.

---

## HTTP hardening

- Helmet security headers
- CORS allowlist
- Request size limits
- Rate limiting
- Structured logs with request IDs; API errors include `error.requestId`. Production 5xx messages do not expose stacks, SQL, or paths. No passwords, reset tokens, session tokens, or payment credentials in logs.

---

## Files

- Storage via `StorageProvider` (`LocalStorageProvider` or `ObjectStorageProvider` SigV4). Local disk remains the default until `STORAGE_PROVIDER=s3` is set.
- Size limits
- MIME allowlist (images, PDF, common office/csv)
- Never serve uploaded files as executable
- Do not store blobs in PostgreSQL

---

## Secrets

- Environment variables only
- `.env` is gitignored
- No secrets in the repository

---

## Audit

Tenant-scoped audit log for: login/logout, password reset requested/completed, student/parent/teacher mutations, marks, attendance, fees, invitations, role changes, exports, payment initiated/confirmed/failed, refunds, subscription lifecycle, invoice issue/void, reconciliation, AI insight requested/completed/failed (`ai.student_insight.*`). AI audit metadata is limited to provider name — not prompts, answers, or Student 360 payloads.

## AI

- The model is not the authorization boundary. Context is built only after session tenant + RBAC + relationship checks.
- Clients cannot submit `studentData` / `tenantId` as AI context.
- `SUPER_ADMIN` does not automatically receive student AI.
- `AI_ENABLED` defaults to false. Provider keys never appear in `/health` or the browser.
- Prompt injection is treated as untrusted user text; unauthorized rows are never in the prompt.

See [AI.md](./AI.md) and [ADR-018](./adr/ADR-018-ai-student-insights.md).

## Payments and webhooks

- Checkout amount, invoice, and institution come from server records. Clients cannot submit payable amounts.
- `POST /webhooks/razorpay` verifies HMAC-SHA256 of the raw body. Invalid signatures return 400. Processing failures return 500 so the provider retries.
- Idempotency: unique `(provider, providerEventId)`. Duplicates do not create a second SUCCESS payment.
- Frontend success pages are not proof of payment.
- `PAYMENTS_ENABLED` defaults to false. Production rejects `PAYMENT_PROVIDER=test` and fails startup if payments are enabled without keys.
- Refunds: super-admin (financial write) only. A refund is a new row; historical `BillingPayment` amounts are not rewritten.

Invitation tokens are returned to the inviter in the API/UI for activation. They are not written to audit metadata or email logs. `POST /auth/invitations/accept` 401s stay on the accept page (they do not bounce to login).

Teachers only receive assigned batches from `GET /batches`. Attendance and assessment writes still go through `assertTeacherBatchAccess` (same-tenant unauthorized batch → **403**; cross-tenant batch → **404**).

Paged admin lists (`?page=`) remain tenant-scoped; omitting `page` keeps the original array response for existing tests.

---

## Known non-goals for MVP

- Full WAF
- Hardware key / WebAuthn
- Per-row encryption at rest (rely on disk encryption + Postgres access control)
- Payment PCI scope (Razorpay hosted checkout; KluCoach never stores PAN/CVV/UPI PIN)

Legal/compliance review is required before commercial launch; this document is engineering intent, not legal advice.
