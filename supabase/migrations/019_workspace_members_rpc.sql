-- Returns all humans and non-revoked agents for a given tenant.
-- Accessible to all authenticated actors (no admin role required).
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
    'role', p.role
  ))
  INTO v_humans
  FROM profiles p
  JOIN tenant_members tm ON tm.user_id = p.id
  WHERE tm.tenant_id = p_tenant_id;

  SELECT jsonb_agg(jsonb_build_object(
    'id', a.id,
    'name', a.name,
    'avatar_url', a.avatar_url
  ))
  INTO v_agents
  FROM agents a
  WHERE a.tenant_id = p_tenant_id
    AND a.revoked_at IS NULL;

  RETURN jsonb_build_object(
    'humans', COALESCE(v_humans, '[]'::jsonb),
    'agents', COALESCE(v_agents, '[]'::jsonb)
  );
END;
$$;

NOTIFY pgrst, 'reload schema';
