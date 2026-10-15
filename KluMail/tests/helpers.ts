import { Client } from "pg";

export async function resetDatabase(): Promise<void> {
  const connectionString = process.env.TEST_DATABASE_ADMIN_URL;
  if (!connectionString) throw new Error("TEST_DATABASE_ADMIN_URL is not set");
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query(`
      TRUNCATE
        audit_logs, domain_events, background_jobs, notifications, notification_preferences,
        saved_views, ticket_events, attachments, messages, ticket_links, ticket_tags, tickets,
        customer_emails, customers, mock_provider_messages, mock_mailbox_controls, mailbox_sync_states,
        mailbox_credentials, mailboxes, oauth_states, invitations, team_memberships, teams,
        categories, tags, organization_memberships, organization_counters, organizations,
        system_emails, rate_limit_buckets, email_verification_tokens, password_reset_tokens,
        sessions, user_secrets, users
      RESTART IDENTITY CASCADE
    `);
  } finally {
    await client.end();
  }
}
