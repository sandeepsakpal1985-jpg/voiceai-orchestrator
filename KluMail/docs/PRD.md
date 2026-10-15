# KluMail product requirements — Phase 1

KluMail is a commercial multi-tenant SaaS for customer support email. A business connects a mailbox, incoming mail becomes tickets, and agents work those tickets without seeing another organization's data.

## Users

- Organization administrator: settings, people, teams, mailboxes, all tickets, export, dashboards.
- Manager: team tickets, assignment, team dashboard, export.
- Agent: assigned tickets and tickets for their teams, replies, internal notes, own dashboard.

## Phase 1 outcomes

- Register, sign in, sign out, reset a password, and verify an email.
- Create an organization and switch among organizations the user belongs to.
- Invite members, assign roles, and disable members.
- Create teams and memberships.
- Open, update, assign, resolve, close, and reopen tickets.
- Keep a conversation of inbound mail, outbound replies, and internal notes.
- Search and filter tickets inside the caller's permission scope.
- Show role dashboards from database counts. Do not show SLA, FCR, sentiment, or quality scores.
- Notify members about assignments, mentions, customer replies, and mailbox failures.
- Connect a mailbox through an OAuth-shaped adapter. Development uses a simulated provider. Gmail and Microsoft 365 use their official APIs when credentials exist.

## Non-goals for Phase 1

AI replies, sentiment, classification, automated resolution, SLA breach automation, FCR, agent scoring, quality assurance, root-cause analysis, predictive SLA, advanced workflow automation, WhatsApp, live chat, voice, a knowledge base, customer analytics portals, enterprise billing, and full enterprise SSO.
