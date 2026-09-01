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
- Rate limit login and invitation-accept endpoints

Production rate limits (in-process `@fastify/rate-limit`; no Redis):

| Endpoint | Max | Window | Rationale |
|----------|-----|--------|-----------|
| `POST /auth/login` | 10 | 1 minute | Credential stuffing |
| `POST /auth/register` | 5 | 1 minute | Institution spam |
| `POST /auth/invitations/accept` | 10 | 1 minute | Token guessing |
| `POST /invitations` | 20 | 1 minute | Invite flood |
| `POST /imports/students/preview` | 20 | 1 minute | Parse CPU |
| Global (other routes) | 300 | 1 minute | Generic abuse |
| `/health`, `/ready` | allow-listed | — | Probes |

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
- Structured logs with request IDs; no passwords or session tokens in logs

---

## Files

- Storage via `FileStorage` port (local disk in MVP)
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

Tenant-scoped audit log for: login/logout, student/parent/teacher mutations, marks, attendance, fees, invitations, role changes, exports.

---

## Known non-goals for MVP

- Full WAF
- Hardware key / WebAuthn
- Per-row encryption at rest (rely on disk encryption + Postgres access control)
- Payment PCI scope (no gateway)

Legal/compliance review is required before commercial launch; this document is engineering intent, not legal advice.
