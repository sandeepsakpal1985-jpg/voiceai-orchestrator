-- KluMail Phase 1 schema. Timestamps are timestamptz (UTC).

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  name text NOT NULL,
  email_verified_at timestamptz,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_unique ON users (lower(email));

CREATE TABLE user_secrets (
  user_id uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  password_hash text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  user_agent text,
  ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_idx ON sessions (user_id);

CREATE TABLE password_reset_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE email_verification_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE rate_limit_buckets (
  bucket text NOT NULL,
  window_start timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, window_start)
);

CREATE TABLE system_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id uuid REFERENCES users (id) ON DELETE SET NULL,
  recipient_email text NOT NULL,
  subject text NOT NULL,
  body_text text NOT NULL,
  template text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX system_emails_recipient_idx ON system_emails (lower(recipient_email), created_at DESC);

CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  timezone text NOT NULL DEFAULT 'UTC',
  logo_path text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'deleted')),
  default_priority text NOT NULL DEFAULT 'normal' CHECK (default_priority IN ('low', 'normal', 'high', 'urgent')),
  default_signature text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE organization_counters (
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  counter_name text NOT NULL,
  value bigint NOT NULL,
  PRIMARY KEY (organization_id, counter_name)
);

CREATE TABLE organization_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('org_admin', 'manager', 'agent')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  email_signature text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);
CREATE INDEX memberships_user_idx ON organization_memberships (user_id);

CREATE TABLE teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, name)
);

CREATE TABLE team_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  team_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, user_id),
  FOREIGN KEY (organization_id, team_id) REFERENCES teams (organization_id, id) ON DELETE CASCADE
);
CREATE INDEX team_memberships_user_idx ON team_memberships (user_id);

CREATE TABLE invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL CHECK (role IN ('org_admin', 'manager', 'agent')),
  team_id uuid,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  invited_by uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id, team_id) REFERENCES teams (organization_id, id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX invitations_pending_email ON invitations (organization_id, lower(email)) WHERE accepted_at IS NULL;

CREATE TABLE categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  name text NOT NULL,
  parent_id uuid,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id)
);
CREATE UNIQUE INDEX categories_name_unique ON categories (organization_id, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));
ALTER TABLE categories
  ADD CONSTRAINT categories_parent_fk FOREIGN KEY (organization_id, parent_id) REFERENCES categories (organization_id, id) ON DELETE RESTRICT;

CREATE TABLE tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#0c6b62',
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id)
);
CREATE UNIQUE INDEX tags_name_unique ON tags (organization_id, lower(name));

CREATE TABLE mailboxes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  team_id uuid,
  provider text NOT NULL CHECK (provider IN ('gmail', 'microsoft', 'mock')),
  email_address text NOT NULL,
  display_name text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'connected', 'disconnected', 'error')),
  status_reason text,
  sync_status text NOT NULL DEFAULT 'idle' CHECK (sync_status IN ('idle', 'syncing', 'ok', 'error')),
  last_sync_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  external_account_id text,
  created_by uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, team_id) REFERENCES teams (organization_id, id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX mailboxes_provider_email ON mailboxes (organization_id, provider, lower(email_address));

CREATE TABLE mailbox_credentials (
  mailbox_id uuid PRIMARY KEY REFERENCES mailboxes (id) ON DELETE CASCADE,
  access_token_ciphertext text NOT NULL,
  refresh_token_ciphertext text,
  token_expires_at timestamptz,
  scopes text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE mailbox_sync_states (
  mailbox_id uuid PRIMARY KEY REFERENCES mailboxes (id) ON DELETE CASCADE,
  cursor text,
  history_id text,
  delta_link text,
  subscription_id text,
  subscription_expires_at timestamptz,
  last_reconciled_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE oauth_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('gmail', 'microsoft', 'mock')),
  state_hash text NOT NULL UNIQUE,
  team_id uuid,
  mailbox_id uuid,
  email_address text,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  display_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id)
);
CREATE INDEX customers_org_name_idx ON customers (organization_id, lower(display_name));

CREATE TABLE customer_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  customer_id uuid NOT NULL,
  email text NOT NULL,
  is_primary boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id, customer_id) REFERENCES customers (organization_id, id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX customer_emails_org_email ON customer_emails (organization_id, lower(email));

CREATE TABLE tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  reference text NOT NULL,
  customer_id uuid NOT NULL,
  subject text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'pending', 'resolved', 'closed')),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  category_id uuid,
  assigned_user_id uuid REFERENCES users (id) ON DELETE SET NULL,
  assigned_team_id uuid,
  mailbox_id uuid,
  source text NOT NULL CHECK (source IN ('email', 'manual')),
  provider_thread_id text,
  resolution_note text,
  merged_into_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  closed_at timestamptz,
  search_vector tsvector GENERATED ALWAYS AS (to_tsvector('english', coalesce(subject, ''))) STORED,
  UNIQUE (organization_id, reference),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, customer_id) REFERENCES customers (organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, category_id) REFERENCES categories (organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, assigned_team_id) REFERENCES teams (organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, mailbox_id) REFERENCES mailboxes (organization_id, id) ON DELETE RESTRICT
);
CREATE INDEX tickets_org_activity_idx ON tickets (organization_id, last_activity_at DESC);
CREATE INDEX tickets_org_status_idx ON tickets (organization_id, status);
CREATE INDEX tickets_assignee_idx ON tickets (organization_id, assigned_user_id);
CREATE INDEX tickets_team_idx ON tickets (organization_id, assigned_team_id);
CREATE INDEX tickets_customer_idx ON tickets (organization_id, customer_id);
CREATE INDEX tickets_thread_idx ON tickets (mailbox_id, provider_thread_id);
CREATE INDEX tickets_search_idx ON tickets USING gin (search_vector);

CREATE TABLE ticket_tags (
  ticket_id uuid NOT NULL,
  tag_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ticket_id, tag_id),
  FOREIGN KEY (organization_id, ticket_id) REFERENCES tickets (organization_id, id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id, tag_id) REFERENCES tags (organization_id, id) ON DELETE RESTRICT
);

CREATE TABLE ticket_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  ticket_id uuid NOT NULL,
  related_ticket_id uuid NOT NULL,
  link_type text NOT NULL CHECK (link_type IN ('related', 'duplicate', 'merged_into', 'merged_from')),
  created_by uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ticket_id <> related_ticket_id),
  UNIQUE (ticket_id, related_ticket_id, link_type),
  FOREIGN KEY (organization_id, ticket_id) REFERENCES tickets (organization_id, id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id, related_ticket_id) REFERENCES tickets (organization_id, id) ON DELETE CASCADE
);

CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  ticket_id uuid NOT NULL,
  mailbox_id uuid,
  kind text NOT NULL CHECK (kind IN ('inbound', 'outbound', 'internal_note')),
  delivery_status text NOT NULL CHECK (delivery_status IN ('received', 'draft', 'queued', 'sending', 'accepted', 'failed', 'internal')),
  author_user_id uuid REFERENCES users (id) ON DELETE SET NULL,
  customer_id uuid,
  from_email text,
  from_name text,
  to_emails jsonb NOT NULL DEFAULT '[]'::jsonb,
  cc_emails jsonb NOT NULL DEFAULT '[]'::jsonb,
  subject text,
  body_text text NOT NULL DEFAULT '',
  body_html text,
  body_html_raw text,
  provider text,
  provider_message_id text,
  provider_draft_id text,
  provider_thread_id text,
  message_id_header text,
  in_reply_to text,
  references_header text,
  client_request_id text,
  send_error text,
  provider_accepted_at timestamptz,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  search_vector tsvector GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(subject, '') || ' ' || coalesce(body_text, ''))
  ) STORED,
  FOREIGN KEY (organization_id, ticket_id) REFERENCES tickets (organization_id, id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id, mailbox_id) REFERENCES mailboxes (organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, customer_id) REFERENCES customers (organization_id, id) ON DELETE SET NULL
);
CREATE INDEX messages_ticket_idx ON messages (ticket_id, occurred_at);
CREATE INDEX messages_header_idx ON messages (organization_id, message_id_header);
CREATE INDEX messages_search_idx ON messages USING gin (search_vector);
CREATE UNIQUE INDEX messages_provider_id_unique ON messages (mailbox_id, provider_message_id) WHERE provider_message_id IS NOT NULL;
CREATE UNIQUE INDEX messages_client_request_unique ON messages (organization_id, client_request_id) WHERE client_request_id IS NOT NULL;

CREATE TABLE attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES messages (id) ON DELETE CASCADE,
  ticket_id uuid NOT NULL,
  filename text NOT NULL,
  content_type text NOT NULL,
  size_bytes integer NOT NULL,
  storage_key text NOT NULL,
  sha256 text,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id, ticket_id) REFERENCES tickets (organization_id, id) ON DELETE CASCADE
);
CREATE INDEX attachments_message_idx ON attachments (message_id);

CREATE TABLE ticket_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  ticket_id uuid NOT NULL,
  actor_user_id uuid REFERENCES users (id) ON DELETE SET NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id, ticket_id) REFERENCES tickets (organization_id, id) ON DELETE CASCADE
);
CREATE INDEX ticket_events_ticket_idx ON ticket_events (ticket_id, created_at);

CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  ticket_id uuid,
  dedupe_key text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id, ticket_id) REFERENCES tickets (organization_id, id) ON DELETE CASCADE
);
CREATE INDEX notifications_user_idx ON notifications (user_id, created_at DESC);
CREATE UNIQUE INDEX notifications_dedupe_unique ON notifications (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL;

CREATE TABLE notification_preferences (
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  event_type text NOT NULL,
  in_app boolean NOT NULL DEFAULT true,
  PRIMARY KEY (organization_id, user_id, event_type)
);

CREATE TABLE saved_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name text NOT NULL,
  query jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id, name)
);

CREATE TABLE audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations (id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES users (id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_org_idx ON audit_logs (organization_id, created_at DESC);

CREATE TABLE background_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  job_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'succeeded', 'failed', 'dead')),
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  run_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  locked_by text,
  last_error text,
  dedupe_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX background_jobs_due_idx ON background_jobs (run_at) WHERE status = 'pending';
CREATE UNIQUE INDEX background_jobs_dedupe_active ON background_jobs (dedupe_key)
  WHERE status IN ('pending', 'running') AND dedupe_key IS NOT NULL;

CREATE TABLE mock_provider_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  mailbox_id uuid NOT NULL REFERENCES mailboxes (id) ON DELETE CASCADE,
  provider_message_id text NOT NULL,
  provider_thread_id text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  from_email text NOT NULL,
  from_name text,
  to_emails jsonb NOT NULL DEFAULT '[]'::jsonb,
  cc_emails jsonb NOT NULL DEFAULT '[]'::jsonb,
  subject text NOT NULL DEFAULT '',
  body_text text NOT NULL DEFAULT '',
  body_html text,
  message_id_header text,
  in_reply_to text,
  references_header text,
  app_message_id text,
  headers jsonb NOT NULL DEFAULT '{}'::jsonb,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (mailbox_id, provider_message_id)
);

CREATE TABLE mock_mailbox_controls (
  mailbox_id uuid PRIMARY KEY REFERENCES mailboxes (id) ON DELETE CASCADE,
  fail_sends_remaining integer NOT NULL DEFAULT 0,
  fail_syncs_remaining integer NOT NULL DEFAULT 0,
  token_refresh_count integer NOT NULL DEFAULT 0
);

-- Phase 2 extension point. Writers record facts; no AI or SLA consumer ships in Phase 1.
CREATE TABLE domain_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX domain_events_org_idx ON domain_events (organization_id, created_at);

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER users_updated BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER organizations_updated BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER memberships_updated BEFORE UPDATE ON organization_memberships FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER teams_updated BEFORE UPDATE ON teams FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER mailboxes_updated BEFORE UPDATE ON mailboxes FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER customers_updated BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER tickets_updated BEFORE UPDATE ON tickets FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER messages_updated BEFORE UPDATE ON messages FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER jobs_updated BEFORE UPDATE ON background_jobs FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE FUNCTION enforce_ticket_assignee() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.assigned_user_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM organization_memberships m
    WHERE m.organization_id = NEW.organization_id
      AND m.user_id = NEW.assigned_user_id
      AND m.status = 'active'
  ) THEN
    RAISE EXCEPTION 'assignee is not an active member of the organization';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER tickets_assignee_member
  BEFORE INSERT OR UPDATE OF assigned_user_id, organization_id ON tickets
  FOR EACH ROW EXECUTE FUNCTION enforce_ticket_assignee();

CREATE OR REPLACE FUNCTION enforce_team_member() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM organization_memberships m
    WHERE m.organization_id = NEW.organization_id
      AND m.user_id = NEW.user_id
      AND m.status = 'active'
  ) THEN
    RAISE EXCEPTION 'team member is not an active member of the organization';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER team_memberships_org_member
  BEFORE INSERT OR UPDATE ON team_memberships
  FOR EACH ROW EXECUTE FUNCTION enforce_team_member();
