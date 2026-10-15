# Data model

Schema migrations live in `db/migrations` and are applied in filename order. Timestamps are `timestamptz` (UTC). The UI formats them in the organization timezone.

## Identity

- `users`, `user_secrets`, `sessions`
- `password_reset_tokens`, `email_verification_tokens`
- `organizations`, `organization_memberships`, `organization_counters`
- `teams`, `team_memberships`, `invitations`

Ticket numbers come from `organization_counters` and look like `KM-1001`.

## Mail and tickets

- `mailboxes`, `mailbox_credentials` (ciphertext only), `mailbox_sync_states`, `oauth_states`
- `customers`, `customer_emails`
- `tickets`, `ticket_tags`, `ticket_links`, `ticket_events`
- `messages` with kinds `inbound`, `outbound`, and `internal_note`
- `attachments`
- `categories`, `tags`

Statuses are `open`, `in_progress`, `pending`, `resolved`, and `closed`. Pending means waiting on someone else. Resolved means a solution was sent and a customer reply can reopen the ticket. Closed means a reply is blocked until the ticket is reopened.

## Operations

- `notifications`, `notification_preferences`, `saved_views`
- `audit_logs`
- `background_jobs`
- `mock_provider_messages`, `mock_mailbox_controls` for the simulated provider
- `system_emails` when SMTP is not configured
- `domain_events` for later phases

## Integrity

Composite foreign keys include `organization_id` so a ticket cannot point at another organization's customer, team, or mailbox. Referenced categories and tags are archived rather than deleted. Disconnecting a mailbox deletes stored tokens and keeps ticket history.

Direct application inserts of notifications go through `create_notification`, which checks organization membership before writing. SQL helper functions that read memberships are `plpgsql` so row-level security does not inline them away.
