-- Migration 074: Fix is_owner() and is_admin() to check tenant_members instead of profiles
-- Root cause: is_owner() checked profiles.role = 'owner' (global legacy role)
-- but multi-tenant role system uses tenant_members.role per workspace.
-- This broke agent creation (RLS violation on INSERT to agents table).

-- Fix is_owner() — check tenant_members for active workspace
DROP FUNCTION IF EXISTS is_owner();
CREATE OR REPLACE FUNCTION is_owner()
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT EXISTS(
    SELECT 1 FROM tenant_members
    WHERE user_id = auth.uid()
      AND tenant_id = get_my_tenant_id()
      AND role = 'owner'
  )
$$;
GRANT EXECUTE ON FUNCTION is_owner() TO authenticated, anon;

-- Fix is_admin() — check tenant_members for active workspace (owner or admin)
DROP FUNCTION IF EXISTS is_admin();
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT EXISTS(
    SELECT 1 FROM tenant_members
    WHERE user_id = auth.uid()
      AND tenant_id = get_my_tenant_id()
      AND role IN ('owner', 'admin')
  )
$$;
GRANT EXECUTE ON FUNCTION is_admin() TO authenticated, anon;

NOTIFY pgrst, 'reload schema';
