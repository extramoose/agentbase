-- Allow leaving your only workspace — user lands in onboarding to create a new one
CREATE OR REPLACE FUNCTION rpc_leave_workspace(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_other_tenant uuid;
BEGIN
  SELECT role INTO v_role FROM tenant_members
  WHERE tenant_id = p_tenant_id AND user_id = auth.uid();

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'You are not a member of this workspace';
  END IF;

  IF v_role = 'owner' THEN
    RAISE EXCEPTION 'Owners cannot leave — transfer ownership or delete the workspace';
  END IF;

  -- Switch to another workspace if one exists
  SELECT tenant_id INTO v_other_tenant FROM tenant_members
  WHERE user_id = auth.uid() AND tenant_id != p_tenant_id
  ORDER BY joined_at LIMIT 1;

  IF v_other_tenant IS NOT NULL THEN
    UPDATE profiles SET active_tenant_id = v_other_tenant WHERE id = auth.uid();
  ELSE
    UPDATE profiles SET active_tenant_id = NULL WHERE id = auth.uid();
  END IF;

  DELETE FROM tenant_members WHERE tenant_id = p_tenant_id AND user_id = auth.uid();
END; $$;

NOTIFY pgrst, 'reload schema';
