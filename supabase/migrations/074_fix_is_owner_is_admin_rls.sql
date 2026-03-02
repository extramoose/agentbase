-- Migration 074: Fix is_owner() and is_admin() to check tenant_members instead of profiles
-- Must drop ALL dependent policies before replacing functions

-- Drop policies depending on is_owner()
DROP POLICY IF EXISTS "Owners manage agents" ON agents;
DROP POLICY IF EXISTS "Owner manages members" ON tenant_members;

-- Drop policies depending on is_admin()
DROP POLICY IF EXISTS "Admins read all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can manage agent avatars" ON storage.objects;

-- Replace is_owner() — now checks tenant_members
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

-- Replace is_admin() — now checks tenant_members
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

-- Recreate all dropped policies
CREATE POLICY "Owners manage agents" ON agents
  FOR ALL
  USING  (is_active_tenant(tenant_id) AND is_owner())
  WITH CHECK (is_active_tenant(tenant_id) AND is_owner());

CREATE POLICY "Owner manages members" ON tenant_members
  FOR ALL
  USING  (tenant_id = get_my_tenant_id() AND is_owner())
  WITH CHECK (tenant_id = get_my_tenant_id() AND is_owner());

CREATE POLICY "Admins read all profiles" ON profiles
  FOR SELECT
  USING (is_admin());

CREATE POLICY "Admins can manage agent avatars" ON storage.objects
  FOR ALL
  USING (bucket_id = 'avatars' AND is_admin())
  WITH CHECK (bucket_id = 'avatars' AND is_admin());

NOTIFY pgrst, 'reload schema';
