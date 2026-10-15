-- SQL functions can be inlined into RLS policies and then lose SECURITY DEFINER.
-- plpgsql keeps the definer rights so membership checks are not filtered by the caller's policies.

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
