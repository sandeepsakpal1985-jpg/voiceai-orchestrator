# Known issues

- Live Gmail and Microsoft 365 accounts were not connected in this environment. The adapters exist. Only the mock provider was executed.
- `npm audit` reports five high findings, all GHSA-vfj7-8cjw-p6xm (`braces` stack exhaustion) pulled in by `eslint-config-next` through `fast-glob`. The suggested fix downgrades `eslint-config-next` to 14.2.35, which does not match Next.js 16. These packages are development lint tools, not the production server bundle. No critical advisories were reported.
- Next.js prints a warning that `middleware.ts` should move to `proxy`. The production build still exits 0.
- Invitation expiry is enforced in `accept_invitation` (`expires_at > now()`). The automated tests cover acceptance, not an already-expired invitation.
- The browser journey does not download an attachment, change another user's role, or open another organization's mailbox. Those denials are covered for tickets, status updates, and CSV export in the integration tests.
- Browser assignment of a ticket to a specific agent is implemented in the ticket page and covered by the integration assignment test, not by Playwright.
- Interactive browser tools were not available. Browser coverage is the Playwright suite, not a manual click-through in Cursor.
- The development outbox and simulated mailbox must never be enabled in production. The mock connect path rejects `APP_ENV=production`.
- Notification inserts go through `create_notification` because a direct insert policy could not see another member's row under the caller's RLS even when the security-definer check succeeded. Direct inserts by `klumail_app` still use the table policy.
- `npm run worker` and the dev server are separate processes. Request handling also drains a small batch of jobs so a single-user development session does not depend on the worker, but production should run the worker.
- System PostgreSQL on port 5432 was not used. The app cluster is local to this project on port 5433. If `.env.local` is deleted while `data/postgres` remains, the local superuser password no longer matches. Reinitialize `data/postgres` or reset the role password before relying on a new env file.
- Phase 1 does not send password-reset mail through a real inbox unless SMTP is configured. Development reads `system_emails` or `/dev/outbox`.
- Attachment bytes are stored on the local disk under `data/attachments`. That directory is not an object store and is not backed up by `pg_dump`.
- Saved views can be stored. The inbox UI uses the standard views and query-string filters rather than a saved-view manager.
- Bulk update is available to the API for managers and administrators with a 50-ticket cap. The inbox does not yet expose a bulk selection toolbar.
