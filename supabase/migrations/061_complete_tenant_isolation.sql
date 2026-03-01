-- 061_complete_tenant_isolation.sql
-- #238: Final tenant isolation migration
-- Fixes ALL remaining role checks, LIMIT 1 patterns, and stale policies.
--
-- What was already fixed in 058-060:
--   • is_tenant_member() redefined to check active tenant via get_my_tenant_id()
--   • Main entity table RLS updated to is_active_tenant
--   • activity_log, tenants, tenant_members SELECT RLS updated
--   • get_workspace_settings() fixed
--   • Invite RPCs (rpc_create_invite, rpc_list_invites, rpc_revoke_invite, rpc_remove_member) fixed
--
-- What THIS migration fixes:
--   1. is_superadmin() / is_admin() — wrong role names after 057 rename
--   2. Create is_owner() alias
--   3. Agents table RLS — uses broken is_superadmin()
--   4. tenant_members "Superadmin manages members" — checks role = 'superadmin'
--   5. get_workspace_members() — uses LIMIT 1 pattern
--   6. update_workspace_settings() — uses is_superadmin() + LIMIT 1
--   7. rpc_setup_workspace() — inserts 'superadmin' role
--   8. admin_update_profile() — checks for 'superadmin'
--   9. workspace_invites stale policy "admins can manage invites" never dropped

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Fix is_superadmin() — check 'owner' not 'superadmin'
--    (profiles.role was renamed from 'superadmin' → 'owner' in migration 057)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION is_superadmin()
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT EXISTS(SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'owner')
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Create is_owner() — preferred name going forward (alias of is_superadmin)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION is_owner()
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT EXISTS(SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'owner')
$$;
GRANT EXECUTE ON FUNCTION is_owner() TO authenticated, anon;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Fix is_admin() — check ('admin','owner') not ('admin','superadmin')
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT EXISTS(SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','owner'))
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Fix agents table RLS
--    "Superadmins manage agents" used broken is_superadmin()
--    "Members read workspace agents" used is_tenant_member() — already fixed
-- ═══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Superadmins manage agents" ON agents;
CREATE POLICY "Owners manage agents" ON agents
  FOR ALL
  USING  (is_active_tenant(tenant_id) AND is_owner())
  WITH CHECK (is_active_tenant(tenant_id) AND is_owner());

-- Also update the read policy to use is_active_tenant for consistency
DROP POLICY IF EXISTS "Members read workspace agents" ON agents;
CREATE POLICY "Active workspace read agents" ON agents
  FOR SELECT
  USING (is_active_tenant(tenant_id));

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Fix tenant_members "Superadmin manages members"
--    Checked tm.role = 'superadmin' — now needs 'owner'
--    Also scope to active tenant
-- ═══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Superadmin manages members" ON tenant_members;
CREATE POLICY "Owner manages members" ON tenant_members
  FOR ALL
  USING (is_active_tenant(tenant_id) AND is_owner())
  WITH CHECK (is_active_tenant(tenant_id) AND is_owner());

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. Fix get_workspace_members() — uses LIMIT 1 pattern
--    (from 005_agents_table.sql, never updated)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_workspace_members()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE v_result jsonb;
BEGIN
  SELECT jsonb_agg(row_to_json(r)) INTO v_result FROM (
    SELECT p.id, p.email, p.full_name, p.avatar_url, p.role, tm.joined_at
    FROM tenant_members tm
    JOIN profiles p ON p.id = tm.user_id
    WHERE tm.tenant_id = get_my_tenant_id()
      AND tm.role != 'agent'
    ORDER BY tm.joined_at
  ) r;
  RETURN COALESCE(v_result, '[]'::jsonb);
END; $f$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. Fix update_workspace_settings() — uses is_superadmin() + LIMIT 1
--    (from 007_workspace_settings.sql, never updated)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION update_workspace_settings(
  p_name text DEFAULT NULL,
  p_openrouter_api_key text DEFAULT NULL,
  p_default_model text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE
  v_tenant_id uuid;
BEGIN
  IF NOT is_owner() THEN RAISE EXCEPTION 'Access denied'; END IF;
  v_tenant_id := get_my_tenant_id();
  UPDATE tenants SET
    name = COALESCE(p_name, name),
    openrouter_api_key = COALESCE(p_openrouter_api_key, openrouter_api_key),
    default_model = COALESCE(p_default_model, default_model),
    updated_at = now()
  WHERE id = v_tenant_id;
END; $f$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. Fix rpc_setup_workspace() — inserts 'superadmin' role
--    (from 032_fix_onboarding_superadmin_role.sql)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION rpc_setup_workspace(p_workspace_name text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id uuid;
  v_tenant_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF EXISTS (SELECT 1 FROM tenant_members WHERE user_id = v_user_id LIMIT 1) THEN
    RAISE EXCEPTION 'User already has a workspace';
  END IF;
  INSERT INTO tenants (name) VALUES (p_workspace_name) RETURNING id INTO v_tenant_id;
  INSERT INTO tenant_members (tenant_id, user_id, role) VALUES (v_tenant_id, v_user_id, 'owner');
  UPDATE profiles SET active_tenant_id = v_tenant_id, role = 'owner' WHERE id = v_user_id;
  RETURN jsonb_build_object('tenant_id', v_tenant_id);
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 9. Fix admin_update_profile() — checks for 'superadmin'
--    (from 005_agents_table.sql, never updated)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION admin_update_profile(
  p_target_id uuid,
  p_avatar_url text DEFAULT NULL,
  p_full_name  text DEFAULT NULL,
  p_role       text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE v_caller_role text;
BEGIN
  SELECT role INTO v_caller_role FROM profiles WHERE id = auth.uid();
  IF v_caller_role NOT IN ('admin', 'owner') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  UPDATE profiles SET
    avatar_url = COALESCE(p_avatar_url, avatar_url),
    full_name  = COALESCE(p_full_name, full_name),
    role       = COALESCE(p_role, role),
    updated_at = now()
  WHERE id = p_target_id;
END; $f$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 10. Drop stale workspace_invites policy
--     Migration 060 tried to drop "workspace_invites_policy" but the actual
--     policy name from 024 was "admins can manage invites". Drop it now.
-- ═══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "admins can manage invites" ON workspace_invites;

-- ═══════════════════════════════════════════════════════════════════════════
-- Done — reload PostgREST schema cache
-- ═══════════════════════════════════════════════════════════════════════════

NOTIFY pgrst, 'reload schema';
