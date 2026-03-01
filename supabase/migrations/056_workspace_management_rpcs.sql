-- #223: Workspace management RPCs — create, rename, delete, leave

-- Create workspace: creates tenant + adds creator as owner
CREATE OR REPLACE FUNCTION rpc_create_workspace(p_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
BEGIN
  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'Workspace name is required';
  END IF;
  
  INSERT INTO tenants (id, name) VALUES (gen_random_uuid(), trim(p_name))
  RETURNING id INTO v_tenant_id;
  
  INSERT INTO tenant_members (tenant_id, user_id, role)
  VALUES (v_tenant_id, auth.uid(), 'owner');
  
  -- Switch to the new workspace
  UPDATE profiles SET active_tenant_id = v_tenant_id WHERE id = auth.uid();
  
  RETURN v_tenant_id;
END;
$$;

-- Rename workspace: owner or admin only
CREATE OR REPLACE FUNCTION rpc_rename_workspace(p_tenant_id uuid, p_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'Workspace name is required';
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM tenant_members
    WHERE tenant_id = p_tenant_id AND user_id = auth.uid() AND role IN ('owner', 'admin')
  ) THEN
    RAISE EXCEPTION 'Only owners and admins can rename workspaces';
  END IF;
  
  UPDATE tenants SET name = trim(p_name) WHERE id = p_tenant_id;
END;
$$;

-- Delete workspace: owner only, cannot delete last workspace
CREATE OR REPLACE FUNCTION rpc_delete_workspace(p_tenant_id uuid, p_confirm_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
  v_workspace_count int;
BEGIN
  -- Must be owner
  IF NOT EXISTS (
    SELECT 1 FROM tenant_members
    WHERE tenant_id = p_tenant_id AND user_id = auth.uid() AND role = 'owner'
  ) THEN
    RAISE EXCEPTION 'Only the workspace owner can delete it';
  END IF;
  
  -- Get workspace name for confirmation
  SELECT name INTO v_name FROM tenants WHERE id = p_tenant_id;
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Workspace not found';
  END IF;
  
  -- Confirm name matches
  IF trim(p_confirm_name) != v_name THEN
    RAISE EXCEPTION 'Workspace name does not match';
  END IF;
  
  -- Cannot delete last workspace
  SELECT count(*) INTO v_workspace_count
  FROM tenant_members WHERE user_id = auth.uid();
  IF v_workspace_count <= 1 THEN
    RAISE EXCEPTION 'Cannot delete your only workspace';
  END IF;
  
  -- Switch user to another workspace first
  UPDATE profiles SET active_tenant_id = (
    SELECT tenant_id FROM tenant_members
    WHERE user_id = auth.uid() AND tenant_id != p_tenant_id
    ORDER BY joined_at LIMIT 1
  ) WHERE id = auth.uid();
  
  -- Delete the workspace (cascades to tenant_members, tasks, etc.)
  DELETE FROM tenants WHERE id = p_tenant_id;
END;
$$;

-- Leave workspace: admin/member only (owners cannot leave)
CREATE OR REPLACE FUNCTION rpc_leave_workspace(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_workspace_count int;
BEGIN
  SELECT role INTO v_role FROM tenant_members
  WHERE tenant_id = p_tenant_id AND user_id = auth.uid();
  
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'You are not a member of this workspace';
  END IF;
  
  IF v_role = 'owner' THEN
    RAISE EXCEPTION 'Owners cannot leave — transfer ownership or delete the workspace';
  END IF;
  
  -- Cannot leave last workspace
  SELECT count(*) INTO v_workspace_count
  FROM tenant_members WHERE user_id = auth.uid();
  IF v_workspace_count <= 1 THEN
    RAISE EXCEPTION 'Cannot leave your only workspace';
  END IF;
  
  -- Switch to another workspace if this was active
  UPDATE profiles SET active_tenant_id = (
    SELECT tenant_id FROM tenant_members
    WHERE user_id = auth.uid() AND tenant_id != p_tenant_id
    ORDER BY joined_at LIMIT 1
  ) WHERE id = auth.uid() AND active_tenant_id = p_tenant_id;
  
  DELETE FROM tenant_members WHERE tenant_id = p_tenant_id AND user_id = auth.uid();
END;
$$;

NOTIFY pgrst, 'reload schema';
