-- #238: Nuclear fix — redefine is_tenant_member to check active tenant
-- This fixes ALL RPCs and RLS policies in one shot

CREATE OR REPLACE FUNCTION is_tenant_member(p_tenant_id uuid)
RETURNS boolean LANGUAGE sql
SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT p_tenant_id = get_my_tenant_id()
$$;

-- Also fix get_workspace_settings to use get_my_tenant_id() directly
CREATE OR REPLACE FUNCTION get_workspace_settings()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE v_result jsonb;
BEGIN
  SELECT to_jsonb(t.*) INTO v_result
  FROM tenants t
  WHERE t.id = get_my_tenant_id();
  RETURN v_result;
END; $f$;

NOTIFY pgrst, 'reload schema';

-- Fix invite RPCs that use LIMIT 1 instead of get_my_tenant_id()

CREATE OR REPLACE FUNCTION rpc_list_invites()
RETURNS SETOF workspace_invites LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY SELECT * FROM workspace_invites WHERE tenant_id = get_my_tenant_id() ORDER BY created_at DESC;
END; $$;

CREATE OR REPLACE FUNCTION rpc_revoke_invite(p_invite_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE workspace_invites SET revoked_at = now()
  WHERE id = p_invite_id AND tenant_id = get_my_tenant_id() AND accepted_at IS NULL AND revoked_at IS NULL;
END; $$;

CREATE OR REPLACE FUNCTION rpc_remove_member(p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_user_id = auth.uid() THEN RAISE EXCEPTION 'Cannot remove yourself'; END IF;
  DELETE FROM tenant_members WHERE tenant_id = get_my_tenant_id() AND user_id = p_user_id;
END; $$;

CREATE OR REPLACE FUNCTION rpc_create_invite()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_tenant_id uuid := get_my_tenant_id();
  v_invite workspace_invites;
BEGIN
  INSERT INTO workspace_invites (tenant_id, created_by, token)
  VALUES (v_tenant_id, v_user_id, encode(gen_random_bytes(32), 'hex'))
  RETURNING * INTO v_invite;
  RETURN to_jsonb(v_invite);
END; $$;

-- Also fix workspace_invites RLS
DROP POLICY IF EXISTS "workspace_invites_policy" ON workspace_invites;
CREATE POLICY "Active workspace invites" ON workspace_invites FOR ALL
  TO authenticated
  USING (tenant_id = get_my_tenant_id());

NOTIFY pgrst, 'reload schema';
