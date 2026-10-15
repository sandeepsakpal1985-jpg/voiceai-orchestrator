DROP POLICY notifications_insert ON notifications;
CREATE POLICY notifications_insert ON notifications FOR INSERT TO klumail_app
  WITH CHECK (
    app_is_org_member(notifications.organization_id)
    AND app_user_in_org(notifications.user_id, notifications.organization_id)
  );
