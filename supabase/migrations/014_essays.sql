-- 014_essays.sql
-- Essays — timeless living document type

CREATE TABLE IF NOT EXISTS essays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  tags text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_essays_tenant ON essays (tenant_id, updated_at DESC);
ALTER TABLE essays ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant members can manage essays"
  ON essays FOR ALL USING (is_tenant_member(tenant_id)) WITH CHECK (is_tenant_member(tenant_id));

-- Trigger for updated_at
CREATE TRIGGER essays_updated_at BEFORE UPDATE ON essays
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- SECURITY DEFINER RPC for creating essays (atomically logs to activity_log)
CREATE OR REPLACE FUNCTION rpc_create_essay(p_tenant_id uuid, p_title text, p_actor_id uuid, p_actor_type text)
RETURNS essays LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_essay essays;
BEGIN
  INSERT INTO essays (tenant_id, title) VALUES (p_tenant_id, p_title) RETURNING * INTO v_essay;
  INSERT INTO activity_log (entity_type, entity_id, tenant_id, actor_id, actor_type, event_type, payload)
  VALUES ('essay', v_essay.id, p_tenant_id, p_actor_id, p_actor_type, 'created', jsonb_build_object('label', p_title));
  RETURN v_essay;
END;$$;

-- SECURITY DEFINER RPC for agent reads (bypasses RLS)
CREATE OR REPLACE FUNCTION rpc_list_essays(p_tenant_id uuid)
RETURNS SETOF essays LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT * FROM essays WHERE tenant_id = p_tenant_id
  ORDER BY updated_at DESC;
$$;

GRANT EXECUTE ON FUNCTION rpc_create_essay(uuid, text, uuid, text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION rpc_list_essays(uuid) TO authenticated, anon;
