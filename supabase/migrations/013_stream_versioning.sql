-- Stream entries: lightweight scratchpad inputs (never cleared)
CREATE TABLE IF NOT EXISTS stream_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  content text NOT NULL,
  actor_id uuid NOT NULL,
  actor_type text NOT NULL CHECK (actor_type IN ('human', 'agent')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_stream_entries_entity ON stream_entries (entity_type, entity_id, created_at DESC);
CREATE INDEX idx_stream_entries_tenant ON stream_entries (tenant_id, created_at DESC);

-- Document versions: synthesized document snapshots
CREATE TABLE IF NOT EXISTS document_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  version_number integer NOT NULL,
  content text NOT NULL,
  change_summary text NOT NULL,
  context_hint text,
  actor_id uuid NOT NULL,
  actor_type text NOT NULL CHECK (actor_type IN ('human', 'agent')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_id, version_number)
);
CREATE INDEX idx_document_versions_entity ON document_versions (entity_type, entity_id, version_number DESC);
CREATE INDEX idx_document_versions_tenant ON document_versions (tenant_id, created_at DESC);

-- RLS
ALTER TABLE stream_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant members can read stream_entries"
  ON stream_entries FOR SELECT
  USING (is_tenant_member(tenant_id));

CREATE POLICY "tenant members can insert stream_entries"
  ON stream_entries FOR INSERT
  WITH CHECK (is_tenant_member(tenant_id));

CREATE POLICY "tenant members can delete own stream_entries"
  ON stream_entries FOR DELETE
  USING (is_tenant_member(tenant_id) AND actor_id = auth.uid());

CREATE POLICY "tenant members can read document_versions"
  ON document_versions FOR SELECT
  USING (is_tenant_member(tenant_id));

CREATE POLICY "tenant members can insert document_versions"
  ON document_versions FOR INSERT
  WITH CHECK (is_tenant_member(tenant_id));

CREATE POLICY "superadmin can delete document_versions"
  ON document_versions FOR DELETE
  USING (is_superadmin());

-- SECURITY DEFINER RPCs for agent access

-- rpc_list_stream_entries
CREATE OR REPLACE FUNCTION rpc_list_stream_entries(p_tenant_id uuid, p_entity_type text, p_entity_id uuid)
RETURNS SETOF stream_entries LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY SELECT * FROM stream_entries
    WHERE tenant_id = p_tenant_id AND entity_type = p_entity_type AND entity_id = p_entity_id
    ORDER BY created_at ASC
    LIMIT 50;
END;$$;

-- rpc_list_document_versions
CREATE OR REPLACE FUNCTION rpc_list_document_versions(p_tenant_id uuid, p_entity_type text, p_entity_id uuid)
RETURNS SETOF document_versions LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY SELECT * FROM document_versions
    WHERE tenant_id = p_tenant_id AND entity_type = p_entity_type AND entity_id = p_entity_id
    ORDER BY version_number DESC;
END;$$;

-- rpc_create_stream_entry
CREATE OR REPLACE FUNCTION rpc_create_stream_entry(
  p_tenant_id uuid, p_entity_type text, p_entity_id uuid,
  p_content text, p_actor_id uuid, p_actor_type text
) RETURNS stream_entries LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_entry stream_entries;
BEGIN
  INSERT INTO stream_entries (tenant_id, entity_type, entity_id, content, actor_id, actor_type)
  VALUES (p_tenant_id, p_entity_type, p_entity_id, p_content, p_actor_id, p_actor_type)
  RETURNING * INTO v_entry;
  RETURN v_entry;
END;$$;
