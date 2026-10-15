DROP POLICY notifications_insert ON notifications;
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
