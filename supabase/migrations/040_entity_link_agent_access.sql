-- Migration 040: Allow agents to create/delete entity links
-- The is_tenant_member() check uses auth.uid(), which is NULL for agent
-- requests (they authenticate via API key, not JWT). Add a fallback that
-- checks whether p_actor_id is a non-revoked agent belonging to the tenant.

-- ── rpc_create_entity_link ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION rpc_create_entity_link(
  p_tenant_id   uuid,
  p_actor_id    uuid,
  p_source_type text,
  p_source_id   uuid,
  p_target_type text,
  p_target_id   uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_actor_type   text;
  v_source_name  text;
  v_target_name  text;
BEGIN
  IF NOT is_tenant_member(p_tenant_id)
     AND NOT EXISTS (SELECT 1 FROM agents WHERE id = p_actor_id AND tenant_id = p_tenant_id AND revoked_at IS NULL)
  THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT CASE WHEN EXISTS(SELECT 1 FROM agents WHERE id = p_actor_id AND revoked_at IS NULL)
    THEN 'agent' ELSE 'human' END INTO v_actor_type;

  -- Look up display names
  v_source_name := _entity_display_name(p_source_type, p_source_id);
  v_target_name := _entity_display_name(p_target_type, p_target_id);

  -- Insert both directions (ignore if already exists)
  INSERT INTO entity_links (tenant_id, source_type, source_id, target_type, target_id)
  VALUES (p_tenant_id, p_source_type, p_source_id, p_target_type, p_target_id)
  ON CONFLICT DO NOTHING;

  INSERT INTO entity_links (tenant_id, source_type, source_id, target_type, target_id)
  VALUES (p_tenant_id, p_target_type, p_target_id, p_source_type, p_source_id)
  ON CONFLICT DO NOTHING;

  -- Log activity on source entity (payload references TARGET)
  INSERT INTO activity_log (tenant_id, entity_type, entity_id, event_type, actor_id, actor_type, payload)
  VALUES (p_tenant_id, p_source_type, p_source_id, 'linked', p_actor_id, v_actor_type,
    jsonb_build_object('linked_type', p_target_type, 'linked_id', p_target_id, 'linked_name', v_target_name));

  -- Log activity on target entity (payload references SOURCE)
  INSERT INTO activity_log (tenant_id, entity_type, entity_id, event_type, actor_id, actor_type, payload)
  VALUES (p_tenant_id, p_target_type, p_target_id, 'linked', p_actor_id, v_actor_type,
    jsonb_build_object('linked_type', p_source_type, 'linked_id', p_source_id, 'linked_name', v_source_name));

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ── rpc_delete_entity_link ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION rpc_delete_entity_link(
  p_tenant_id   uuid,
  p_actor_id    uuid,
  p_source_type text,
  p_source_id   uuid,
  p_target_type text,
  p_target_id   uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_actor_type   text;
  v_source_name  text;
  v_target_name  text;
BEGIN
  IF NOT is_tenant_member(p_tenant_id)
     AND NOT EXISTS (SELECT 1 FROM agents WHERE id = p_actor_id AND tenant_id = p_tenant_id AND revoked_at IS NULL)
  THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT CASE WHEN EXISTS(SELECT 1 FROM agents WHERE id = p_actor_id AND revoked_at IS NULL)
    THEN 'agent' ELSE 'human' END INTO v_actor_type;

  -- Look up display names before deleting
  v_source_name := _entity_display_name(p_source_type, p_source_id);
  v_target_name := _entity_display_name(p_target_type, p_target_id);

  DELETE FROM entity_links
  WHERE tenant_id = p_tenant_id
    AND ((source_type = p_source_type AND source_id = p_source_id AND target_type = p_target_type AND target_id = p_target_id)
      OR (source_type = p_target_type AND source_id = p_target_id AND target_type = p_source_type AND target_id = p_source_id));

  -- Log activity on source entity (payload references TARGET)
  INSERT INTO activity_log (tenant_id, entity_type, entity_id, event_type, actor_id, actor_type, payload)
  VALUES (p_tenant_id, p_source_type, p_source_id, 'unlinked', p_actor_id, v_actor_type,
    jsonb_build_object('unlinked_type', p_target_type, 'unlinked_id', p_target_id, 'unlinked_name', v_target_name));

  -- Log activity on target entity (payload references SOURCE)
  INSERT INTO activity_log (tenant_id, entity_type, entity_id, event_type, actor_id, actor_type, payload)
  VALUES (p_tenant_id, p_target_type, p_target_id, 'unlinked', p_actor_id, v_actor_type,
    jsonb_build_object('unlinked_type', p_source_type, 'unlinked_id', p_source_id, 'unlinked_name', v_source_name));

  RETURN jsonb_build_object('success', true);
END;
$$;

NOTIFY pgrst, 'reload schema';
