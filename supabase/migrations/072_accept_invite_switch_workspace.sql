-- Accept invite now switches active workspace to the new one
CREATE OR REPLACE FUNCTION rpc_accept_invite(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_user_email text;
  v_invite workspace_invites;
  v_workspace_name text;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_invite FROM workspace_invites
    WHERE token = p_token AND accepted_at IS NULL AND revoked_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid or expired invite'; END IF;

  -- If invite has an email, verify it matches
  IF v_invite.email IS NOT NULL THEN
    SELECT email INTO v_user_email FROM auth.users WHERE id = v_user_id;
    IF v_user_email != v_invite.email THEN
      RAISE EXCEPTION 'This invite was sent to a different email address';
    END IF;
  END IF;

  -- Add to workspace
  INSERT INTO tenant_members (tenant_id, user_id, role) VALUES (v_invite.tenant_id, v_user_id, 'member')
    ON CONFLICT (tenant_id, user_id) DO NOTHING;

  -- Switch active workspace to the new one
  UPDATE profiles SET active_tenant_id = v_invite.tenant_id WHERE id = v_user_id;

  -- Mark accepted
  UPDATE workspace_invites SET accepted_by = v_user_id, accepted_at = now() WHERE id = v_invite.id;

  -- Get workspace name for the response
  SELECT name INTO v_workspace_name FROM tenants WHERE id = v_invite.tenant_id;

  RETURN jsonb_build_object('tenant_id', v_invite.tenant_id, 'workspace_name', v_workspace_name);
END; $$;

NOTIFY pgrst, 'reload schema';
