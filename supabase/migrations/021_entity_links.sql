-- Migration 021: Entity links — polymorphic bidirectional links between any two entities
-- Supersedes the narrower task↔CRM linking spec (#65)

CREATE TABLE IF NOT EXISTS entity_links (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id   uuid        NOT NULL,
  source_type text        NOT NULL,
  source_id   uuid        NOT NULL,
  target_type text        NOT NULL,
  target_id   uuid        NOT NULL,
  created_at  timestamptz DEFAULT now(),
  UNIQUE (tenant_id, source_type, source_id, target_type, target_id)
);

ALTER TABLE entity_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant members can read links"
  ON entity_links FOR SELECT
  USING (is_tenant_member(tenant_id));

CREATE POLICY "tenant members can insert links"
  ON entity_links FOR INSERT
  WITH CHECK (is_tenant_member(tenant_id));

CREATE POLICY "tenant members can delete links"
  ON entity_links FOR DELETE
  USING (is_tenant_member(tenant_id));

-- Create a link (inserts both directions for bidirectionality)
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
  v_actor_type text;
BEGIN
  IF NOT is_tenant_member(p_tenant_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT CASE WHEN EXISTS(SELECT 1 FROM agents WHERE id = p_actor_id AND revoked_at IS NULL)
    THEN 'agent' ELSE 'human' END INTO v_actor_type;

  -- Insert both directions (ignore if already exists)
  INSERT INTO entity_links (tenant_id, source_type, source_id, target_type, target_id)
  VALUES (p_tenant_id, p_source_type, p_source_id, p_target_type, p_target_id)
  ON CONFLICT DO NOTHING;

  INSERT INTO entity_links (tenant_id, source_type, source_id, target_type, target_id)
  VALUES (p_tenant_id, p_target_type, p_target_id, p_source_type, p_source_id)
  ON CONFLICT DO NOTHING;

  -- Log activity on source entity
  INSERT INTO activity_log (tenant_id, entity_type, entity_id, event_type, actor_id, actor_type, payload)
  VALUES (p_tenant_id, p_source_type, p_source_id, 'linked', p_actor_id, v_actor_type,
    jsonb_build_object('linked_type', p_target_type, 'linked_id', p_target_id));

  RETURN jsonb_build_object('success', true);
END;
$$;

-- Delete a link (removes both directions)
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
  v_actor_type text;
BEGIN
  IF NOT is_tenant_member(p_tenant_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT CASE WHEN EXISTS(SELECT 1 FROM agents WHERE id = p_actor_id AND revoked_at IS NULL)
    THEN 'agent' ELSE 'human' END INTO v_actor_type;

  DELETE FROM entity_links
  WHERE tenant_id = p_tenant_id
    AND ((source_type = p_source_type AND source_id = p_source_id AND target_type = p_target_type AND target_id = p_target_id)
      OR (source_type = p_target_type AND source_id = p_target_id AND target_type = p_source_type AND target_id = p_source_id));

  -- Log activity
  INSERT INTO activity_log (tenant_id, entity_type, entity_id, event_type, actor_id, actor_type, payload)
  VALUES (p_tenant_id, p_source_type, p_source_id, 'unlinked', p_actor_id, v_actor_type,
    jsonb_build_object('unlinked_type', p_target_type, 'unlinked_id', p_target_id));

  RETURN jsonb_build_object('success', true);
END;
$$;

-- List all entities linked to a given entity (one direction only — bidirectionality handled by double-insert)
CREATE OR REPLACE FUNCTION rpc_list_entity_links(
  p_tenant_id   uuid,
  p_entity_type text,
  p_entity_id   uuid
)
RETURNS TABLE (
  link_id     uuid,
  target_type text,
  target_id   uuid,
  created_at  timestamptz
)
LANGUAGE sql
SECURITY DEFINER SET search_path = public STABLE
AS $$
  SELECT id, target_type, target_id, created_at
  FROM entity_links
  WHERE tenant_id = p_tenant_id
    AND source_type = p_entity_type
    AND source_id = p_entity_id
  ORDER BY created_at ASC;
$$;

NOTIFY pgrst, 'reload schema';
