-- Fix: workspace creator needs profiles.role = 'superadmin' for agent RLS policies.
-- The is_superadmin() function checks profiles.role, not tenant_members.role.

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
  INSERT INTO tenant_members (tenant_id, user_id, role) VALUES (v_tenant_id, v_user_id, 'superadmin');
  UPDATE profiles SET active_tenant_id = v_tenant_id, role = 'superadmin' WHERE id = v_user_id;
  RETURN jsonb_build_object('tenant_id', v_tenant_id);
END;
$$;
