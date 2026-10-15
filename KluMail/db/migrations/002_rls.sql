-- Row-level security and least-privilege grants.
-- Request traffic uses klumail_app. Jobs and token storage use klumail_worker.
-- Credential lookup uses klumail_auth. None of these roles are superusers.

CREATE OR REPLACE FUNCTION app_user_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.user_id', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION app_org_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.organization_id', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION app_is_org_member(p_org uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM organization_memberships m
    WHERE m.organization_id = p_org
      AND m.user_id = app_user_id()
      AND m.status = 'active'
  );
END;
$$;

CREATE OR REPLACE FUNCTION app_is_org_admin(p_org uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM organization_memberships m
    WHERE m.organization_id = p_org
      AND m.user_id = app_user_id()
      AND m.status = 'active'
      AND m.role = 'org_admin'
  );
END;
$$;

CREATE OR REPLACE FUNCTION app_user_in_org(p_user uuid, p_org uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM organization_memberships m
    WHERE m.organization_id = p_org
      AND m.user_id = p_user
      AND m.status = 'active'
  );
END;
$$;

CREATE OR REPLACE FUNCTION app_has_any_membership(p_org uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM organization_memberships m
    WHERE m.organization_id = p_org
      AND m.user_id = app_user_id()
  );
END;
$$;

CREATE OR REPLACE FUNCTION create_organization(p_name text, p_slug text, p_timezone text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  org uuid := gen_random_uuid();
  uid uuid := app_user_id();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF p_name IS NULL OR length(trim(p_name)) < 2 THEN
    RAISE EXCEPTION 'organization name is required';
  END IF;
  INSERT INTO organizations (id, name, slug, timezone)
  VALUES (org, trim(p_name), p_slug, COALESCE(NULLIF(p_timezone, ''), 'UTC'));
  INSERT INTO organization_memberships (organization_id, user_id, role, status)
  VALUES (org, uid, 'org_admin', 'active');
  INSERT INTO organization_counters (organization_id, counter_name, value)
  VALUES (org, 'ticket', 1000);
  INSERT INTO categories (organization_id, name)
  VALUES (org, 'General'), (org, 'Billing'), (org, 'Technical'), (org, 'Account');
  RETURN org;
END;
$$;

CREATE OR REPLACE FUNCTION next_ticket_reference(p_org uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  n bigint;
BEGIN
  IF p_org IS NULL THEN
    RAISE EXCEPTION 'organization required';
  END IF;
  IF NOT (app_org_id() = p_org OR COALESCE(app_is_org_member(p_org), false)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE organization_counters
    SET value = value + 1
    WHERE organization_id = p_org AND counter_name = 'ticket'
    RETURNING value INTO n;
  IF n IS NULL THEN
    RAISE EXCEPTION 'ticket counter missing';
  END IF;
  RETURN 'KM-' || n::text;
END;
$$;

REVOKE ALL ON FUNCTION app_user_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION app_org_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION app_is_org_member(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_is_org_admin(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_user_in_org(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_has_any_membership(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION create_organization(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION next_ticket_reference(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION app_user_id() TO klumail_app, klumail_worker, klumail_auth;
GRANT EXECUTE ON FUNCTION app_org_id() TO klumail_app, klumail_worker, klumail_auth;
GRANT EXECUTE ON FUNCTION app_is_org_member(uuid) TO klumail_app, klumail_worker;
GRANT EXECUTE ON FUNCTION app_is_org_admin(uuid) TO klumail_app, klumail_worker;
GRANT EXECUTE ON FUNCTION app_user_in_org(uuid, uuid) TO klumail_app, klumail_worker;
GRANT EXECUTE ON FUNCTION app_has_any_membership(uuid) TO klumail_app;
GRANT EXECUTE ON FUNCTION create_organization(text, text, text) TO klumail_app;
GRANT EXECUTE ON FUNCTION next_ticket_reference(uuid) TO klumail_app, klumail_worker;

GRANT USAGE ON SCHEMA public TO klumail_app, klumail_worker, klumail_auth;

-- Auth tables: grants only. No policies for app or worker, so they cannot read secrets.
GRANT SELECT, INSERT, UPDATE, DELETE ON users TO klumail_auth;
GRANT SELECT, INSERT, UPDATE, DELETE ON user_secrets TO klumail_auth;
GRANT SELECT, INSERT, UPDATE, DELETE ON sessions TO klumail_auth;
GRANT SELECT, INSERT, UPDATE, DELETE ON password_reset_tokens TO klumail_auth;
GRANT SELECT, INSERT, UPDATE, DELETE ON email_verification_tokens TO klumail_auth;
GRANT SELECT, INSERT, UPDATE, DELETE ON rate_limit_buckets TO klumail_auth;
GRANT SELECT, INSERT ON system_emails TO klumail_auth;

GRANT SELECT (id, email, name, email_verified_at, status, created_at, updated_at) ON users TO klumail_app;
GRANT UPDATE (name, updated_at) ON users TO klumail_app;
GRANT SELECT (id, email, name, email_verified_at, status) ON users TO klumail_worker;

GRANT SELECT ON organizations TO klumail_app, klumail_worker;
GRANT UPDATE (name, timezone, logo_path, status, default_priority, default_signature, updated_at) ON organizations TO klumail_app;

GRANT SELECT, INSERT, UPDATE ON organization_memberships TO klumail_app;
GRANT SELECT ON organization_memberships TO klumail_worker;
GRANT SELECT ON organization_counters TO klumail_app, klumail_worker;

GRANT SELECT, INSERT, UPDATE, DELETE ON teams TO klumail_app;
GRANT SELECT ON teams TO klumail_worker;
GRANT SELECT, INSERT, DELETE ON team_memberships TO klumail_app;
GRANT SELECT ON team_memberships TO klumail_worker;

GRANT SELECT, INSERT, UPDATE ON invitations TO klumail_app;

GRANT SELECT, INSERT, UPDATE ON categories TO klumail_app;
GRANT SELECT ON categories TO klumail_worker;
GRANT SELECT, INSERT, UPDATE ON tags TO klumail_app;
GRANT SELECT ON tags TO klumail_worker;

GRANT SELECT, INSERT, UPDATE ON mailboxes TO klumail_app, klumail_worker;
GRANT SELECT, INSERT, UPDATE, DELETE ON mailbox_credentials TO klumail_worker;
GRANT SELECT, INSERT, UPDATE ON mailbox_sync_states TO klumail_worker;
GRANT SELECT, INSERT, UPDATE ON oauth_states TO klumail_app;

GRANT SELECT, INSERT, UPDATE ON customers TO klumail_app, klumail_worker;
GRANT SELECT, INSERT, UPDATE ON customer_emails TO klumail_app, klumail_worker;

GRANT SELECT, INSERT, UPDATE ON tickets TO klumail_app, klumail_worker;
GRANT SELECT, INSERT, DELETE ON ticket_tags TO klumail_app, klumail_worker;
GRANT SELECT, INSERT ON ticket_links TO klumail_app, klumail_worker;
GRANT SELECT, INSERT, UPDATE ON messages TO klumail_app, klumail_worker;
GRANT SELECT, INSERT ON attachments TO klumail_app, klumail_worker;
GRANT SELECT, INSERT ON ticket_events TO klumail_app, klumail_worker;

GRANT SELECT, INSERT, UPDATE ON notifications TO klumail_app, klumail_worker;
GRANT SELECT, INSERT, UPDATE, DELETE ON notification_preferences TO klumail_app;
GRANT SELECT ON notification_preferences TO klumail_worker;
GRANT SELECT, INSERT, DELETE ON saved_views TO klumail_app;
GRANT SELECT, INSERT ON audit_logs TO klumail_app, klumail_worker;
GRANT INSERT ON audit_logs TO klumail_auth;
GRANT SELECT, INSERT ON domain_events TO klumail_app, klumail_worker;

GRANT SELECT, INSERT ON background_jobs TO klumail_app;
GRANT SELECT, INSERT, UPDATE ON background_jobs TO klumail_worker;

GRANT SELECT, INSERT, UPDATE, DELETE ON mock_provider_messages TO klumail_worker;
GRANT SELECT, INSERT, UPDATE ON mock_mailbox_controls TO klumail_worker;

GRANT SELECT ON system_emails TO klumail_app;

-- Hide raw HTML and ciphertext-bearing columns from the application role.
REVOKE SELECT (body_html_raw) ON messages FROM klumail_app;

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
ALTER TABLE system_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_emails FORCE ROW LEVEL SECURITY;
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations FORCE ROW LEVEL SECURITY;
ALTER TABLE organization_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_memberships FORCE ROW LEVEL SECURITY;
ALTER TABLE organization_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_counters FORCE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams FORCE ROW LEVEL SECURITY;
ALTER TABLE team_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_memberships FORCE ROW LEVEL SECURITY;
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations FORCE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories FORCE ROW LEVEL SECURITY;
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags FORCE ROW LEVEL SECURITY;
ALTER TABLE mailboxes ENABLE ROW LEVEL SECURITY;
ALTER TABLE mailboxes FORCE ROW LEVEL SECURITY;
ALTER TABLE mailbox_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE mailbox_credentials FORCE ROW LEVEL SECURITY;
ALTER TABLE mailbox_sync_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE mailbox_sync_states FORCE ROW LEVEL SECURITY;
ALTER TABLE oauth_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_states FORCE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers FORCE ROW LEVEL SECURITY;
ALTER TABLE customer_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_emails FORCE ROW LEVEL SECURITY;
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets FORCE ROW LEVEL SECURITY;
ALTER TABLE ticket_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_tags FORCE ROW LEVEL SECURITY;
ALTER TABLE ticket_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_links FORCE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages FORCE ROW LEVEL SECURITY;
ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE attachments FORCE ROW LEVEL SECURITY;
ALTER TABLE ticket_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_events FORCE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications FORCE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences FORCE ROW LEVEL SECURITY;
ALTER TABLE saved_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_views FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;
ALTER TABLE background_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE background_jobs FORCE ROW LEVEL SECURITY;
ALTER TABLE mock_provider_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE mock_provider_messages FORCE ROW LEVEL SECURITY;
ALTER TABLE mock_mailbox_controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE mock_mailbox_controls FORCE ROW LEVEL SECURITY;
ALTER TABLE domain_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE domain_events FORCE ROW LEVEL SECURITY;

CREATE POLICY users_auth ON users FOR ALL TO klumail_auth USING (true) WITH CHECK (true);
CREATE POLICY users_app_select ON users FOR SELECT TO klumail_app
  USING (id = app_user_id() OR app_user_in_org(id, app_org_id()));
CREATE POLICY users_app_update ON users FOR UPDATE TO klumail_app
  USING (id = app_user_id()) WITH CHECK (id = app_user_id());
CREATE POLICY users_worker_select ON users FOR SELECT TO klumail_worker
  USING (app_user_in_org(id, app_org_id()));

CREATE POLICY system_emails_auth ON system_emails FOR ALL TO klumail_auth USING (true) WITH CHECK (true);
CREATE POLICY system_emails_own ON system_emails FOR SELECT TO klumail_app
  USING (recipient_user_id = app_user_id());

CREATE POLICY organizations_select ON organizations FOR SELECT TO klumail_app
  USING (app_has_any_membership(id));
CREATE POLICY organizations_update ON organizations FOR UPDATE TO klumail_app
  USING (app_is_org_admin(id)) WITH CHECK (app_is_org_admin(id));
CREATE POLICY organizations_worker ON organizations FOR SELECT TO klumail_worker
  USING (id = app_org_id());

CREATE POLICY memberships_select ON organization_memberships FOR SELECT TO klumail_app
  USING (user_id = app_user_id() OR app_is_org_member(organization_id));
CREATE POLICY memberships_write ON organization_memberships FOR INSERT TO klumail_app
  WITH CHECK (app_is_org_admin(organization_id));
CREATE POLICY memberships_update ON organization_memberships FOR UPDATE TO klumail_app
  USING (app_is_org_admin(organization_id)) WITH CHECK (app_is_org_admin(organization_id));
CREATE POLICY memberships_worker ON organization_memberships FOR SELECT TO klumail_worker
  USING (organization_id = app_org_id());

CREATE POLICY counters_app ON organization_counters FOR SELECT TO klumail_app
  USING (app_is_org_member(organization_id));
CREATE POLICY counters_worker ON organization_counters FOR SELECT TO klumail_worker
  USING (organization_id = app_org_id());

CREATE POLICY teams_select ON teams FOR SELECT TO klumail_app USING (app_is_org_member(organization_id));
CREATE POLICY teams_write ON teams FOR INSERT TO klumail_app WITH CHECK (app_is_org_admin(organization_id));
CREATE POLICY teams_update ON teams FOR UPDATE TO klumail_app
  USING (app_is_org_admin(organization_id)) WITH CHECK (app_is_org_admin(organization_id));
CREATE POLICY teams_delete ON teams FOR DELETE TO klumail_app USING (app_is_org_admin(organization_id));
CREATE POLICY teams_worker ON teams FOR SELECT TO klumail_worker USING (organization_id = app_org_id());

CREATE POLICY team_members_select ON team_memberships FOR SELECT TO klumail_app USING (app_is_org_member(organization_id));
CREATE POLICY team_members_write ON team_memberships FOR INSERT TO klumail_app WITH CHECK (app_is_org_admin(organization_id));
CREATE POLICY team_members_delete ON team_memberships FOR DELETE TO klumail_app USING (app_is_org_admin(organization_id));
CREATE POLICY team_members_worker ON team_memberships FOR SELECT TO klumail_worker USING (organization_id = app_org_id());

CREATE POLICY invitations_admin ON invitations FOR ALL TO klumail_app
  USING (app_is_org_admin(organization_id)) WITH CHECK (app_is_org_admin(organization_id));

CREATE POLICY categories_select ON categories FOR SELECT TO klumail_app USING (app_is_org_member(organization_id));
CREATE POLICY categories_write ON categories FOR INSERT TO klumail_app WITH CHECK (app_is_org_admin(organization_id));
CREATE POLICY categories_update ON categories FOR UPDATE TO klumail_app
  USING (app_is_org_admin(organization_id)) WITH CHECK (app_is_org_admin(organization_id));
CREATE POLICY categories_worker ON categories FOR SELECT TO klumail_worker USING (organization_id = app_org_id());

CREATE POLICY tags_select ON tags FOR SELECT TO klumail_app USING (app_is_org_member(organization_id));
CREATE POLICY tags_write ON tags FOR INSERT TO klumail_app WITH CHECK (app_is_org_admin(organization_id));
CREATE POLICY tags_update ON tags FOR UPDATE TO klumail_app
  USING (app_is_org_admin(organization_id)) WITH CHECK (app_is_org_admin(organization_id));
CREATE POLICY tags_worker ON tags FOR SELECT TO klumail_worker USING (organization_id = app_org_id());

CREATE POLICY mailboxes_select ON mailboxes FOR SELECT TO klumail_app USING (app_is_org_member(organization_id));
CREATE POLICY mailboxes_write ON mailboxes FOR INSERT TO klumail_app WITH CHECK (app_is_org_admin(organization_id));
CREATE POLICY mailboxes_update ON mailboxes FOR UPDATE TO klumail_app
  USING (app_is_org_admin(organization_id)) WITH CHECK (app_is_org_admin(organization_id));
CREATE POLICY mailboxes_worker ON mailboxes FOR ALL TO klumail_worker
  USING (organization_id = app_org_id()) WITH CHECK (organization_id = app_org_id());

CREATE POLICY credentials_worker ON mailbox_credentials FOR ALL TO klumail_worker
  USING (mailbox_id IN (SELECT id FROM mailboxes WHERE organization_id = app_org_id()))
  WITH CHECK (mailbox_id IN (SELECT id FROM mailboxes WHERE organization_id = app_org_id()));

CREATE POLICY sync_state_worker ON mailbox_sync_states FOR ALL TO klumail_worker
  USING (mailbox_id IN (SELECT id FROM mailboxes WHERE organization_id = app_org_id()))
  WITH CHECK (mailbox_id IN (SELECT id FROM mailboxes WHERE organization_id = app_org_id()));

CREATE POLICY oauth_owner ON oauth_states FOR ALL TO klumail_app
  USING (user_id = app_user_id() AND app_is_org_member(organization_id))
  WITH CHECK (user_id = app_user_id() AND app_is_org_admin(organization_id));

CREATE POLICY customers_app ON customers FOR ALL TO klumail_app
  USING (app_is_org_member(organization_id)) WITH CHECK (app_is_org_member(organization_id));
CREATE POLICY customers_worker ON customers FOR ALL TO klumail_worker
  USING (organization_id = app_org_id()) WITH CHECK (organization_id = app_org_id());

CREATE POLICY customer_emails_app ON customer_emails FOR ALL TO klumail_app
  USING (app_is_org_member(organization_id)) WITH CHECK (app_is_org_member(organization_id));
CREATE POLICY customer_emails_worker ON customer_emails FOR ALL TO klumail_worker
  USING (organization_id = app_org_id()) WITH CHECK (organization_id = app_org_id());

CREATE POLICY tickets_app ON tickets FOR ALL TO klumail_app
  USING (app_is_org_member(organization_id)) WITH CHECK (app_is_org_member(organization_id));
CREATE POLICY tickets_worker ON tickets FOR ALL TO klumail_worker
  USING (organization_id = app_org_id()) WITH CHECK (organization_id = app_org_id());

CREATE POLICY ticket_tags_app ON ticket_tags FOR ALL TO klumail_app
  USING (app_is_org_member(organization_id)) WITH CHECK (app_is_org_member(organization_id));
CREATE POLICY ticket_tags_worker ON ticket_tags FOR ALL TO klumail_worker
  USING (organization_id = app_org_id()) WITH CHECK (organization_id = app_org_id());

CREATE POLICY ticket_links_app ON ticket_links FOR ALL TO klumail_app
  USING (app_is_org_member(organization_id)) WITH CHECK (app_is_org_member(organization_id));
CREATE POLICY ticket_links_worker ON ticket_links FOR ALL TO klumail_worker
  USING (organization_id = app_org_id()) WITH CHECK (organization_id = app_org_id());

CREATE POLICY messages_app ON messages FOR ALL TO klumail_app
  USING (app_is_org_member(organization_id)) WITH CHECK (app_is_org_member(organization_id));
CREATE POLICY messages_worker ON messages FOR ALL TO klumail_worker
  USING (organization_id = app_org_id()) WITH CHECK (organization_id = app_org_id());

CREATE POLICY attachments_app ON attachments FOR ALL TO klumail_app
  USING (app_is_org_member(organization_id)) WITH CHECK (app_is_org_member(organization_id));
CREATE POLICY attachments_worker ON attachments FOR ALL TO klumail_worker
  USING (organization_id = app_org_id()) WITH CHECK (organization_id = app_org_id());

CREATE POLICY events_app ON ticket_events FOR ALL TO klumail_app
  USING (app_is_org_member(organization_id)) WITH CHECK (app_is_org_member(organization_id));
CREATE POLICY events_worker ON ticket_events FOR ALL TO klumail_worker
  USING (organization_id = app_org_id()) WITH CHECK (organization_id = app_org_id());

CREATE POLICY notifications_select ON notifications FOR SELECT TO klumail_app
  USING (user_id = app_user_id() AND app_is_org_member(organization_id));
CREATE POLICY notifications_insert ON notifications FOR INSERT TO klumail_app
  WITH CHECK (
    app_is_org_member(organization_id)
    AND EXISTS (
      SELECT 1 FROM organization_memberships m
      WHERE m.organization_id = notifications.organization_id
        AND m.user_id = notifications.user_id
        AND m.status = 'active'
    )
  );
CREATE POLICY notifications_update ON notifications FOR UPDATE TO klumail_app
  USING (user_id = app_user_id()) WITH CHECK (user_id = app_user_id());
CREATE POLICY notifications_worker ON notifications FOR ALL TO klumail_worker
  USING (organization_id = app_org_id()) WITH CHECK (organization_id = app_org_id());

CREATE POLICY prefs_owner ON notification_preferences FOR ALL TO klumail_app
  USING (user_id = app_user_id() AND app_is_org_member(organization_id))
  WITH CHECK (user_id = app_user_id() AND app_is_org_member(organization_id));
CREATE POLICY prefs_worker ON notification_preferences FOR SELECT TO klumail_worker
  USING (organization_id = app_org_id());

CREATE POLICY views_owner ON saved_views FOR ALL TO klumail_app
  USING (user_id = app_user_id() AND app_is_org_member(organization_id))
  WITH CHECK (user_id = app_user_id() AND app_is_org_member(organization_id));

CREATE POLICY audit_select ON audit_logs FOR SELECT TO klumail_app USING (organization_id IS NOT NULL AND app_is_org_admin(organization_id));
CREATE POLICY audit_insert ON audit_logs FOR INSERT TO klumail_app WITH CHECK (organization_id IS NOT NULL AND app_is_org_member(organization_id));
CREATE POLICY audit_auth ON audit_logs FOR INSERT TO klumail_auth WITH CHECK (true);
CREATE POLICY audit_worker ON audit_logs FOR ALL TO klumail_worker
  USING (organization_id = app_org_id()) WITH CHECK (organization_id = app_org_id());

CREATE POLICY jobs_select ON background_jobs FOR SELECT TO klumail_app USING (app_is_org_member(organization_id));
CREATE POLICY jobs_insert ON background_jobs FOR INSERT TO klumail_app WITH CHECK (app_is_org_member(organization_id));
CREATE POLICY jobs_worker ON background_jobs FOR ALL TO klumail_worker USING (true) WITH CHECK (true);

CREATE POLICY mock_messages_worker ON mock_provider_messages FOR ALL TO klumail_worker
  USING (organization_id = app_org_id()) WITH CHECK (organization_id = app_org_id());
CREATE POLICY mock_controls_worker ON mock_mailbox_controls FOR ALL TO klumail_worker
  USING (mailbox_id IN (SELECT id FROM mailboxes WHERE organization_id = app_org_id()))
  WITH CHECK (mailbox_id IN (SELECT id FROM mailboxes WHERE organization_id = app_org_id()));

CREATE POLICY domain_events_app ON domain_events FOR ALL TO klumail_app
  USING (app_is_org_member(organization_id)) WITH CHECK (app_is_org_member(organization_id));
CREATE POLICY domain_events_worker ON domain_events FOR ALL TO klumail_worker
  USING (organization_id = app_org_id()) WITH CHECK (organization_id = app_org_id());

CREATE OR REPLACE FUNCTION preview_invitation(p_token_hash text)
RETURNS TABLE(email text, role text, organization_name text, expires_at timestamptz, accepted boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT i.email, i.role, o.name, i.expires_at, i.accepted_at IS NOT NULL
  FROM invitations i
  JOIN organizations o ON o.id = i.organization_id
  WHERE i.token_hash = p_token_hash
$$;

CREATE OR REPLACE FUNCTION accept_invitation(p_token_hash text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  inv invitations%ROWTYPE;
  uid uuid := app_user_id();
  user_email text;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  SELECT email INTO user_email FROM users WHERE id = uid;
  SELECT * INTO inv FROM invitations
    WHERE token_hash = p_token_hash AND accepted_at IS NULL AND expires_at > now();
  IF inv.id IS NULL THEN
    RAISE EXCEPTION 'invitation is invalid or expired';
  END IF;
  IF lower(inv.email) <> lower(user_email) THEN
    RAISE EXCEPTION 'invitation email does not match';
  END IF;
  INSERT INTO organization_memberships (organization_id, user_id, role, status)
  VALUES (inv.organization_id, uid, inv.role, 'active')
  ON CONFLICT (organization_id, user_id)
  DO UPDATE SET role = EXCLUDED.role, status = 'active', updated_at = now();
  IF inv.team_id IS NOT NULL THEN
    INSERT INTO team_memberships (organization_id, team_id, user_id)
    VALUES (inv.organization_id, inv.team_id, uid)
    ON CONFLICT (team_id, user_id) DO NOTHING;
  END IF;
  UPDATE invitations SET accepted_at = now() WHERE id = inv.id;
  RETURN inv.organization_id;
END;
$$;

REVOKE ALL ON FUNCTION preview_invitation(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION accept_invitation(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION preview_invitation(text) TO klumail_auth;
GRANT EXECUTE ON FUNCTION accept_invitation(text) TO klumail_app;

CREATE OR REPLACE FUNCTION mailboxes_due(p_minutes integer) RETURNS TABLE(id uuid, organization_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.id, m.organization_id
  FROM mailboxes m
  WHERE m.status = 'connected'
    AND (m.last_success_at IS NULL OR m.last_success_at < now() - make_interval(mins => p_minutes))
$$;

REVOKE ALL ON FUNCTION mailboxes_due(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION mailboxes_due(integer) TO klumail_worker;
