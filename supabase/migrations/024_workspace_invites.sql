CREATE TABLE IF NOT EXISTS workspace_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_by uuid REFERENCES auth.users(id),
  accepted_at timestamptz,
  revoked_at timestamptz
);

CREATE INDEX ON workspace_invites(tenant_id);
CREATE INDEX ON workspace_invites(token);

ALTER TABLE workspace_invites ENABLE ROW LEVEL SECURITY;

-- Only superadmins can see their tenant's invites
CREATE POLICY "admins can manage invites"
  ON workspace_invites FOR ALL
  TO authenticated
  USING (tenant_id = (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid() LIMIT 1) AND is_admin());

-- SECURITY DEFINER RPCs (bypass RLS for agent path + anon path)

CREATE OR REPLACE FUNCTION rpc_create_invite()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_tenant_id uuid;
  v_invite workspace_invites;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT tenant_id INTO v_tenant_id FROM tenant_members WHERE user_id = v_user_id LIMIT 1;
  IF v_tenant_id IS NULL THEN RAISE EXCEPTION 'No workspace'; END IF;
  INSERT INTO workspace_invites (tenant_id, created_by) VALUES (v_tenant_id, v_user_id) RETURNING * INTO v_invite;
  RETURN to_jsonb(v_invite);
END; $$;

CREATE OR REPLACE FUNCTION rpc_list_invites()
RETURNS SETOF workspace_invites LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant_id uuid;
BEGIN
  SELECT tenant_id INTO v_tenant_id FROM tenant_members WHERE user_id = auth.uid() LIMIT 1;
  RETURN QUERY SELECT * FROM workspace_invites WHERE tenant_id = v_tenant_id ORDER BY created_at DESC;
END; $$;

CREATE OR REPLACE FUNCTION rpc_revoke_invite(p_invite_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant_id uuid;
BEGIN
  SELECT tenant_id INTO v_tenant_id FROM tenant_members WHERE user_id = auth.uid() LIMIT 1;
  UPDATE workspace_invites SET revoked_at = now()
  WHERE id = p_invite_id AND tenant_id = v_tenant_id AND accepted_at IS NULL AND revoked_at IS NULL;
END; $$;

CREATE OR REPLACE FUNCTION rpc_accept_invite(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_invite workspace_invites;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_invite FROM workspace_invites WHERE token = p_token AND accepted_at IS NULL AND revoked_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid or expired invite'; END IF;
  -- Add to workspace
  INSERT INTO tenant_members (tenant_id, user_id, role) VALUES (v_invite.tenant_id, v_user_id, 'member')
    ON CONFLICT (tenant_id, user_id) DO NOTHING;
  -- Mark accepted
  UPDATE workspace_invites SET accepted_by = v_user_id, accepted_at = now() WHERE id = v_invite.id;
  RETURN jsonb_build_object('tenant_id', v_invite.tenant_id);
END; $$;

CREATE OR REPLACE FUNCTION rpc_remove_member(p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant_id uuid;
BEGIN
  SELECT tenant_id INTO v_tenant_id FROM tenant_members WHERE user_id = auth.uid() LIMIT 1;
  -- Cannot remove self
  IF p_user_id = auth.uid() THEN RAISE EXCEPTION 'Cannot remove yourself'; END IF;
  DELETE FROM tenant_members WHERE tenant_id = v_tenant_id AND user_id = p_user_id;
END; $$;

GRANT EXECUTE ON FUNCTION rpc_create_invite() TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_list_invites() TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_revoke_invite(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_accept_invite(text) TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_remove_member(uuid) TO authenticated;
