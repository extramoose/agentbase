-- 005_agents_table.sql
-- Replace Supabase Auth agent users with a custom agents table + API key auth.

-- New agents table
CREATE TABLE agents (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        text NOT NULL,
  avatar_url  text,
  api_key_hash text NOT NULL UNIQUE,
  owner_id    uuid NOT NULL REFERENCES profiles(id),
  last_seen_at timestamptz,
  revoked_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- RLS: tenant members can read agents in their workspace
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read workspace agents" ON agents
  FOR SELECT USING (is_tenant_member(tenant_id));
CREATE POLICY "Superadmins manage agents" ON agents
  FOR ALL USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'superadmin'
  ));

-- SECURITY DEFINER RPC: resolves an agent by hashed API key (callable by anon role)
-- Returns null if key not found or revoked.
CREATE OR REPLACE FUNCTION resolve_agent_by_key(p_key_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE v_result jsonb;
BEGIN
  SELECT to_jsonb(a.*) INTO v_result
  FROM agents a
  WHERE a.api_key_hash = p_key_hash
    AND a.revoked_at IS NULL;
  -- Update last_seen_at
  IF v_result IS NOT NULL THEN
    UPDATE agents SET last_seen_at = now() WHERE api_key_hash = p_key_hash;
  END IF;
  RETURN v_result;
END; $f$;
GRANT EXECUTE ON FUNCTION resolve_agent_by_key(text) TO anon, authenticated, service_role;

-- SECURITY DEFINER RPC: admin profile update (superadmins only, no secret key needed)
CREATE OR REPLACE FUNCTION admin_update_profile(
  p_target_id uuid,
  p_avatar_url text DEFAULT NULL,
  p_full_name  text DEFAULT NULL,
  p_role       text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE v_caller_role text;
BEGIN
  SELECT role INTO v_caller_role FROM profiles WHERE id = auth.uid();
  IF v_caller_role NOT IN ('admin', 'superadmin') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  UPDATE profiles SET
    avatar_url = COALESCE(p_avatar_url, avatar_url),
    full_name  = COALESCE(p_full_name, full_name),
    role       = COALESCE(p_role, role),
    updated_at = now()
  WHERE id = p_target_id;
END; $f$;
GRANT EXECUTE ON FUNCTION admin_update_profile(uuid, text, text, text) TO authenticated;

-- Drop agent_owners — ownership now encoded on agents.owner_id
DROP TABLE IF EXISTS agent_owners;
