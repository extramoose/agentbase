-- Add active workspace preference to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS active_tenant_id uuid REFERENCES tenants(id) ON DELETE SET NULL;

-- Update get_my_tenant_id() to respect active_tenant_id
CREATE OR REPLACE FUNCTION get_my_tenant_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE AS $$
  SELECT COALESCE(
    -- Use active_tenant_id if set AND user still belongs to it
    CASE WHEN EXISTS (
      SELECT 1 FROM tenant_members tm
      JOIN profiles p ON p.id = auth.uid()
      WHERE tm.user_id = auth.uid() AND tm.tenant_id = p.active_tenant_id
    ) THEN (SELECT active_tenant_id FROM profiles WHERE id = auth.uid())
    ELSE NULL END,
    -- Fall back to first membership
    (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid() ORDER BY joined_at LIMIT 1)
  )
$$;

-- List all workspaces the current user belongs to
CREATE OR REPLACE FUNCTION rpc_list_my_workspaces()
RETURNS TABLE(tenant_id uuid, name text, role text, is_active boolean)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE AS $$
  SELECT
    tm.tenant_id,
    t.name,
    tm.role,
    (tm.tenant_id = get_my_tenant_id()) AS is_active
  FROM tenant_members tm
  JOIN tenants t ON t.id = tm.tenant_id
  WHERE tm.user_id = auth.uid()
  ORDER BY t.name
$$;

-- Switch active workspace (validates membership)
CREATE OR REPLACE FUNCTION rpc_switch_workspace(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_tenant_name text;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  -- Validate user belongs to this tenant
  SELECT t.name INTO v_tenant_name
  FROM tenant_members tm JOIN tenants t ON t.id = tm.tenant_id
  WHERE tm.user_id = v_user_id AND tm.tenant_id = p_tenant_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Not a member of this workspace'; END IF;

  -- Set active tenant
  UPDATE profiles SET active_tenant_id = p_tenant_id WHERE id = v_user_id;

  RETURN jsonb_build_object('tenant_id', p_tenant_id, 'name', v_tenant_name);
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_list_my_workspaces() TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_switch_workspace(uuid) TO authenticated;
