-- Add email column to workspace_invites for tracking who was invited
ALTER TABLE workspace_invites ADD COLUMN IF NOT EXISTS email text;

NOTIFY pgrst, 'reload schema';

-- Update rpc_accept_invite to check email matches if set on invite
CREATE OR REPLACE FUNCTION rpc_accept_invite(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_user_email text;
  v_invite workspace_invites;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_invite FROM workspace_invites
    WHERE token = p_token AND accepted_at IS NULL AND revoked_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid or expired invite'; END IF;

  -- If invite has an email, verify it matches the authenticated user
  IF v_invite.email IS NOT NULL THEN
    SELECT email INTO v_user_email FROM auth.users WHERE id = v_user_id;
    IF v_user_email != v_invite.email THEN
      RAISE EXCEPTION 'This invite was sent to a different email address';
    END IF;
  END IF;

  INSERT INTO tenant_members (tenant_id, user_id, role) VALUES (v_invite.tenant_id, v_user_id, 'member')
    ON CONFLICT (tenant_id, user_id) DO NOTHING;
  UPDATE workspace_invites SET accepted_by = v_user_id, accepted_at = now() WHERE id = v_invite.id;
  RETURN jsonb_build_object('tenant_id', v_invite.tenant_id);
END; $$;

-- Public invite preview: returns workspace name + inviter name for the sign-in page
-- No auth required — only exposes minimal info
CREATE OR REPLACE FUNCTION rpc_invite_preview(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_invite workspace_invites;
  v_workspace_name text;
  v_inviter_name text;
BEGIN
  SELECT * INTO v_invite FROM workspace_invites
    WHERE token = p_token AND accepted_at IS NULL AND revoked_at IS NULL;
  IF NOT FOUND THEN RETURN jsonb_build_object('valid', false); END IF;

  SELECT name INTO v_workspace_name FROM tenants WHERE id = v_invite.tenant_id;
  SELECT raw_user_meta_data->>'full_name' INTO v_inviter_name
    FROM auth.users WHERE id = v_invite.created_by;

  RETURN jsonb_build_object(
    'valid', true,
    'workspace_name', v_workspace_name,
    'inviter_name', coalesce(v_inviter_name, 'Someone')
  );
END; $$;
