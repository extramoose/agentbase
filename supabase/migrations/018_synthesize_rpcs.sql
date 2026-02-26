-- 018_synthesize_rpcs.sql
-- SECURITY DEFINER RPCs for synthesize endpoints (agent path)

-- Get essay title (for agent path)
CREATE OR REPLACE FUNCTION rpc_get_essay(
  p_tenant_id uuid,
  p_essay_id  uuid
)
RETURNS TABLE (id uuid, title text, tags text[])
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT id, title, tags FROM essays
  WHERE id = p_essay_id AND tenant_id = p_tenant_id
  LIMIT 1;
$$;

-- Get diary entry UUID by date (for agent path)
CREATE OR REPLACE FUNCTION rpc_get_diary_entry_id(
  p_tenant_id uuid,
  p_date      date
)
RETURNS TABLE (id uuid)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM diary_entries
  WHERE tenant_id = p_tenant_id AND date = p_date
  LIMIT 1;
$$;

-- Save a document synthesis result: inserts document_version + logs to activity_log atomically
CREATE OR REPLACE FUNCTION rpc_save_document_synthesis(
  p_tenant_id      uuid,
  p_entity_type    text,
  p_entity_id      uuid,
  p_version_number int,
  p_content        text,
  p_change_summary text,
  p_context_hint   text,
  p_actor_id       uuid,
  p_actor_type     text
)
RETURNS SETOF document_versions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_version document_versions;
BEGIN
  INSERT INTO document_versions (tenant_id, entity_type, entity_id, version_number, content, change_summary, context_hint, actor_id, actor_type)
  VALUES (p_tenant_id, p_entity_type, p_entity_id, p_version_number, p_content, p_change_summary, p_context_hint, p_actor_id, p_actor_type)
  RETURNING * INTO v_version;

  INSERT INTO activity_log (tenant_id, entity_type, entity_id, event_type, actor_id, actor_type, payload)
  VALUES (p_tenant_id, p_entity_type, p_entity_id, 'document_version_published', p_actor_id, p_actor_type,
          jsonb_build_object('version_number', p_version_number, 'context_hint', p_context_hint));

  RETURN NEXT v_version;
END;
$$;

NOTIFY pgrst, 'reload schema';
