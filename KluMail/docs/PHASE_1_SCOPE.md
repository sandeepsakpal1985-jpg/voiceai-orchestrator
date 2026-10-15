# Phase 1 scope

Included:

- Account registration, login, logout, password reset, email verification, profile edits.
- Organizations, memberships, invitations, teams, and the three roles.
- Ticket lifecycle, assignment, tags, categories, links, and merge that keeps messages.
- Customers and contact email addresses. Automatic merge only when the same email is seen again, not when names look similar.
- Inbound sync, deduplication, threading by provider id and message-id headers, replies, drafts, internal notes, mentions, and attachment metadata.
- Mock mailbox for development and tests. Gmail and Microsoft Graph adapters in the same interface.
- Inbox views, search, filters, sort, and pagination.
- Role dashboards, CSV export for managers and administrators, notifications, organization settings.
- Audit log rows for sensitive actions, forced RLS, and background jobs with bounded retries.

Excluded: every item in the Phase 1 prompt's out-of-scope list, including AI, SLA, FCR, quality scores, chat, WhatsApp, voice, billing, and enterprise SSO.

Dashboards show ticket counts and mailbox health. They do not invent satisfaction or compliance percentages.
