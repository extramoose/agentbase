-- Fix: use tenant_members.role instead of profiles.role for workspace member lists
CREATE OR REPLACE FUNCTION get_workspace_members()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE v_result jsonb;
BEGIN
  SELECT jsonb_agg(row_to_json(r)) INTO v_result FROM (
    SELECT p.id, p.email, p.full_name, p.avatar_url, tm.role, tm.joined_at
    FROM tenant_members tm
    JOIN profiles p ON p.id = tm.user_id
    WHERE tm.tenant_id = get_my_tenant_id()
      AND tm.role != 'agent'
    ORDER BY tm.joined_at
  ) r;
  RETURN COALESCE(v_result, '[]'::jsonb);
END; $f$;

CREATE OR REPLACE FUNCTION rpc_get_workspace_members(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_humans jsonb;
  v_agents jsonb;
BEGIN
  SELECT jsonb_agg(jsonb_build_object(
    'id', p.id,
    'name', p.full_name,
    'email', p.email,
    'avatar_url', p.avatar_url,
    'role', tm.role
  ))
  INTO v_humans
  FROM profiles p
  JOIN tenant_members tm ON tm.user_id = p.id
  WHERE tm.tenant_id = p_tenant_id;

  SELECT jsonb_agg(jsonb_build_object(
    'id', a.id,
    'name', a.name,
    'avatar_url', a.avatar_url,
    'role', 'agent'
  ))
  INTO v_agents
  FROM agents a
  WHERE a.tenant_id = p_tenant_id;

  RETURN jsonb_build_object(
    'humans', COALESCE(v_humans, '[]'::jsonb),
    'agents', COALESCE(v_agents, '[]'::jsonb)
  );
END; $$;

NOTIFY pgrst, 'reload schema';
