-- Onboarding RPC: create a workspace (tenant) for a new user
CREATE OR REPLACE FUNCTION rpc_setup_workspace(p_workspace_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_tenant_id uuid;
BEGIN
  -- Get the calling user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Check: user must not already have a tenant
  IF EXISTS (SELECT 1 FROM tenant_members WHERE user_id = v_user_id LIMIT 1) THEN
    RAISE EXCEPTION 'User already has a workspace';
  END IF;

  -- Create tenant
  INSERT INTO tenants (name) VALUES (p_workspace_name) RETURNING id INTO v_tenant_id;

  -- Add user as superadmin
  INSERT INTO tenant_members (tenant_id, user_id, role)
  VALUES (v_tenant_id, v_user_id, 'superadmin');

  RETURN jsonb_build_object('tenant_id', v_tenant_id);
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_setup_workspace(text) TO authenticated;
