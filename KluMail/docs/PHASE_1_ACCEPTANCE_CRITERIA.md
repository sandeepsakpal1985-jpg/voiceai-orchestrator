# Phase 1 acceptance criteria

Each item is judged PASS, FAIL, BLOCKED, or NOT TESTED. A mock mailbox does not count as a live Gmail or Microsoft 365 test.

## Functional

- Unauthenticated users cannot open the console.
- Password reset does not reveal account existence.
- Logout revokes the session.
- Organization data is isolated in the database and in the API.
- Administrators, managers, and agents have different ticket and export rights.
- Invitations expire and must match the signed-in email.
- Tickets move through open, in progress, pending, resolved, and closed with history kept.
- Internal notes are not sent to the customer.
- Inbound mail is ingested once.
- Replies are accepted only after the provider call returns, and a retry does not send a second copy.
- Search and dashboards stay inside the caller's organization and role.
- Notifications can be listed and marked read.
- Settings changes require an organization administrator.

## Technical

- TypeScript, lint, and the production build succeed.
- Migrations apply to an empty database.
- Automated unit, integration, and browser tests pass.
- No secrets are committed.
- Open-source use is documented. No AGPL code is copied into this application.

## Reliability

- Duplicate provider messages do not create duplicate tickets.
- Failed sync is stored on the mailbox.
- Job retries use backoff and a dead state.
- Expired mock tokens are refreshed.
- Backup and restore steps are documented.
