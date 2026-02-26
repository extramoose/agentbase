-- 002_command_bus_rpcs.sql
-- Command bus SECURITY DEFINER functions.
-- These were applied to the live DB during ticket #164 but omitted from the
-- initial migration file. Added here so fresh deploys get them automatically.

-- ---------------------------------------------------------------------------
-- rpc_update_entity
-- Generic field-update RPC used by PATCH /api/commands/update
-- Table allowlist + protected field rejection + atomic activity_log write
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_update_entity(
  p_table     text,
  p_entity_id uuid,
  p_fields    jsonb,
  p_actor_id  uuid,
  p_tenant_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_allowed_tables text[] := ARRAY[
    'tasks', 'meetings', 'library_items', 'diary_entries',
    'grocery_items', 'companies', 'people', 'deals'
  ];
  v_protected_fields text[] := ARRAY['id', 'tenant_id', 'actor_id', 'created_at', 'ticket_id'];
  v_key text;
  v_set_clause text := '';
  v_result jsonb;
BEGIN
  -- Validate table name against allowlist
  IF NOT (p_table = ANY(v_allowed_tables)) THEN
    RAISE EXCEPTION 'Table % is not allowed for generic updates', p_table;
  END IF;

  -- Reject protected fields
  FOR v_key IN SELECT jsonb_object_keys(p_fields)
  LOOP
    IF v_key = ANY(v_protected_fields) THEN
      RAISE EXCEPTION 'Field % cannot be updated via generic update route', v_key;
    END IF;
  END LOOP;

  -- Build SET clause dynamically
  SELECT string_agg(
    format('%I = ($1->>%L)::%s',
      key,
      key,
      CASE
        WHEN key IN ('due_date') THEN 'date'
        WHEN key IN ('checked', 'is_public') THEN 'boolean'
        WHEN key IN ('sort_order', 'value') THEN 'numeric'
        WHEN key IN ('tags', 'proposed_tasks') THEN
          CASE WHEN key = 'tags' THEN 'text[]' ELSE 'jsonb' END
        ELSE 'text'
      END
    ),
    ', '
  )
  INTO v_set_clause
  FROM jsonb_object_keys(p_fields) AS key;

  IF v_set_clause IS NULL THEN
    RAISE EXCEPTION 'No fields to update';
  END IF;

  -- Execute update (RLS enforces tenant membership)
  EXECUTE format(
    'UPDATE %I SET %s, updated_at = now() WHERE id = $2 AND tenant_id = $3 RETURNING to_jsonb(%I.*)',
    p_table, v_set_clause, p_table
  )
  USING p_fields, p_entity_id, p_tenant_id
  INTO v_result;

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'Entity not found or access denied';
  END IF;

  -- Write activity_log event
  INSERT INTO activity_log (tenant_id, entity_type, entity_id, event_type, actor_id, actor_type)
  VALUES (
    p_tenant_id,
    p_table,
    p_entity_id,
    'updated',
    p_actor_id,
    (SELECT CASE WHEN EXISTS(SELECT 1 FROM agent_owners WHERE agent_id = p_actor_id)
                 THEN 'agent' ELSE 'human' END)
  );

  RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- rpc_add_comment
-- Inserts a 'commented' event into activity_log for any entity type.
-- Used by POST /api/commands/add-comment
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_add_comment(
  p_entity_type  text,
  p_entity_id    uuid,
  p_entity_label text,
  p_body         text,
  p_actor_id     uuid,
  p_tenant_id    uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  INSERT INTO activity_log (
    tenant_id, entity_type, entity_id, entity_label,
    event_type, actor_id, actor_type, body
  )
  VALUES (
    p_tenant_id,
    p_entity_type,
    p_entity_id,
    p_entity_label,
    'commented',
    p_actor_id,
    (SELECT CASE WHEN EXISTS(SELECT 1 FROM agent_owners WHERE agent_id = p_actor_id)
                 THEN 'agent' ELSE 'human' END),
    p_body
  )
  RETURNING to_jsonb(activity_log.*) INTO v_result;

  RETURN v_result;
END;
$$;
