-- Fix invite preview to check profiles table for name, and ensure it works unauthenticated
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

  -- Check profiles table first, fall back to auth.users metadata
  SELECT full_name INTO v_inviter_name FROM profiles WHERE id = v_invite.created_by;
  IF v_inviter_name IS NULL THEN
    SELECT raw_user_meta_data->>'full_name' INTO v_inviter_name
      FROM auth.users WHERE id = v_invite.created_by;
  END IF;

  RETURN jsonb_build_object(
    'valid', true,
    'workspace_name', v_workspace_name,
    'inviter_name', coalesce(v_inviter_name, 'Someone')
  );
END; $$;

NOTIFY pgrst, 'reload schema';
