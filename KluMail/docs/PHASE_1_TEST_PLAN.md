# Phase 1 test plan

## Static

- `npx tsc --noEmit`
- `npx eslint .`
- `npx next build`
- `npm audit`

## Unit (`tests/unit/domain.test.ts`)

Ticket transitions, permission scope, email normalization, threading decisions, filter parsing, timezone day keys, HTML sanitizing, token encryption, mentions, and password rules.

## Integration (`tests/integration/platform.test.ts`)

Uses `klumail_test` and truncates between tests.

- Password reset does not reveal whether an address exists. Reset and verification tokens are single use.
- Two organizations cannot read or update each other's tickets, including a direct query as the application role.
- Invitation, assignment, status change, internal note, and the assignee's "mine" view.
- Simulated inbound mail creates one ticket. A repeated sync and the outbound reply do not create a second ticket or a second outbound message.
- A simulated sync failure is visible on the mailbox, the token refresh is counted, and a later attempt clears the error.
- Dashboard counts match inserted tickets. Agents cannot export. Disabling a member removes their actor.
- Search by customer email.

## Browser

`tests/e2e/journeys.spec.ts` covers registration, organization setup, a team, an invitation, a simulated mailbox, ticket status, a reply, an internal note, reopen, CSV export, an agent denied export, and a second organization that cannot find the first organization's ticket.

Live Gmail and Microsoft 365 are not part of the automated plan until credentials are supplied. The adapters are covered by code review and by the shared sync path that the mock provider exercises.
