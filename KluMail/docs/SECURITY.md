# Security

## Authentication

Passwords are hashed with bcrypt. Session tokens are random and stored as SHA-256 hashes in an httpOnly, SameSite=Lax cookie named `klumail_session`. Logout sets `revoked_at`. Password reset returns the same message whether or not the address exists. A disabled account is reported only after the password matches. Unknown passwords still run a dummy bcrypt compare.

Cookie mutations require a same-origin `Origin` header when one is present. The job tick endpoint uses `x-worker-secret` and a timing-safe compare.

## Authorization

Roles are `org_admin`, `manager`, and `agent`. Hiding a navigation link is not the authorization check. Server functions call the permission helpers in `src/lib/permissions.ts`.

Agents see tickets assigned to them or to their teams. Unassigned tickets with no team are visible to organization administrators. Agents may claim an unassigned ticket on their team. They cannot reassign another person's ticket or move it to another team. Managers assign inside their teams. Export and bulk update are limited to managers and administrators. Customer merge is limited to administrators.

## Tenant isolation

Row-level security is enabled and forced. Application queries also pass the organization id from the membership record, not from an unchecked browser field. Cross-organization reads in the integration tests return no rows and updates fail as not found.

Service-role and admin connection strings are server-only. The health check reports whether the request role is a superuser. In production that check fails closed when the request role can bypass RLS.

## Mailbox secrets

OAuth tokens are encrypted with AES-256-GCM using `APP_ENCRYPTION_KEY` (32 bytes, base64). The application role cannot read `mailbox_credentials`. OAuth `state` is stored as a hash, expires in 15 minutes, and is single use.

Gmail scopes: `openid`, `email`, `gmail.readonly`, `gmail.send`.
Microsoft scopes: `offline_access`, `openid`, `email`, `User.Read`, `Mail.Read`, `Mail.Send`.

The mock provider is rejected when `APP_ENV=production`.

## Content

Email HTML is sanitized with sanitize-html before it is shown. The application role cannot select `messages.body_html_raw`. Attachment downloads check ticket visibility and reject path traversal. Executable attachment types are not stored.

## Retention and backup

Phase 1 does not automatically delete customer mail. Disconnecting a mailbox keeps tickets. Categories and tags that tickets still use are archived, not removed.

Back up with `pg_dump` of the application database. Restore with `pg_restore` or `psql` into an empty database, then run `npm run db:migrate` so any newer migrations apply. Test restores against a copy. Do not point a restore at the system PostgreSQL cluster unless that is the chosen production instance.

The project-local cluster lives in `data/postgres` on port 5433 and is gitignored. Losing `.env.local` loses the generated local password. Keep that file with the backup of a development machine, or reinitialize the local cluster.

## Production provider setup

Gmail: create an OAuth client, set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REDIRECT_URI`. Optional push uses `GOOGLE_PUBSUB_TOPIC`. Without it, sync is polling plus reconciliation.

Microsoft 365: register an application, set `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_REDIRECT_URI`, and optionally `MICROSOFT_TENANT` and `MICROSOFT_WEBHOOK_URL`. Without a webhook URL, sync is polling plus reconciliation.

SMTP is optional: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`. Development mail is also stored in `system_emails` and shown at `/dev/outbox` only when `APP_ENV=development` and the host is localhost.
