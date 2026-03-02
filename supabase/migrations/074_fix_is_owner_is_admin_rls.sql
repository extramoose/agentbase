-- Migration 074: Fix is_owner() and is_admin() to check tenant_members instead of profiles
-- Root cause: is_owner() checked profiles.role = 'owner' (legacy global role)
-- but multi-tenant role system uses tenant_members.role per workspace.
-- This broke agent creation (RLS violation on INSERT to agents table).

-- Step 1: Drop policies that depend on is_owner() / is_admin()
DROP POLICY IF EXISTS "Owners manage agents" ON agents;
DROP POLICY IF EXISTS "Owner manages members" ON tenant_members;

-- Step 2: Replace the functions
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

-- Step 3: Recreate the policies
CREATE POLICY "Owners manage agents" ON agents
  FOR ALL
  USING  (is_active_tenant(tenant_id) AND is_owner())
  WITH CHECK (is_active_tenant(tenant_id) AND is_owner());

CREATE POLICY "Owner manages members" ON tenant_members
  FOR ALL
  USING  (tenant_id = get_my_tenant_id() AND is_owner())
  WITH CHECK (tenant_id = get_my_tenant_id() AND is_owner());

NOTIFY pgrst, 'reload schema';
