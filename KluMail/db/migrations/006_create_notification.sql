CREATE OR REPLACE FUNCTION create_notification(
  p_org uuid,
  p_user uuid,
  p_type text,
  p_title text,
  p_body text,
  p_ticket uuid,
  p_dedupe text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF app_org_id() IS DISTINCT FROM p_org AND NOT COALESCE(app_is_org_member(p_org), false) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF NOT COALESCE(app_user_in_org(p_user, p_org), false) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  INSERT INTO notifications (organization_id, user_id, type, title, body, ticket_id, dedupe_key)
  VALUES (p_org, p_user, p_type, p_title, COALESCE(p_body, ''), p_ticket, p_dedupe)
  ON CONFLICT (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION create_notification(uuid, uuid, text, text, text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_notification(uuid, uuid, text, text, text, uuid, text) TO klumail_app, klumail_worker;
