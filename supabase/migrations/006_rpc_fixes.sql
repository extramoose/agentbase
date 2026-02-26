-- 006_rpc_fixes.sql
-- Fix rpc_update_entity: remove dropped agent_owners ref, fix tags/latitude/longitude casts

CREATE OR REPLACE FUNCTION rpc_update_entity(
  p_table text, p_entity_id uuid, p_fields jsonb, p_actor_id uuid, p_tenant_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE
  v_allowed_tables  text[] := ARRAY['tasks','meetings','library_items','diary_entries','grocery_items','companies','people','deals'];
  v_protected_fields text[] := ARRAY['id','tenant_id','actor_id','created_at','ticket_id'];
  v_key   text;
  v_set_parts text[] := ARRAY[]::text[];
  v_set_clause text;
  v_result jsonb;
BEGIN
  IF NOT (p_table = ANY(v_allowed_tables)) THEN
    RAISE EXCEPTION 'Table % is not allowed for generic updates', p_table;
  END IF;

  FOR v_key IN SELECT jsonb_object_keys(p_fields) LOOP
    IF v_key = ANY(v_protected_fields) THEN
      RAISE EXCEPTION 'Field % cannot be updated via generic update route', v_key;
    END IF;

    IF v_key = 'tags' THEN
      -- JSON array → text[]: must use jsonb_array_elements_text, not ::text[] cast
      v_set_parts := v_set_parts || format('%I = ARRAY(SELECT jsonb_array_elements_text($1->%L))', v_key, v_key);
    ELSIF v_key = 'proposed_tasks' THEN
      v_set_parts := v_set_parts || format('%I = ($1->%L)::jsonb', v_key, v_key);
    ELSIF v_key IN ('checked', 'is_public') THEN
      v_set_parts := v_set_parts || format('%I = ($1->>%L)::boolean', v_key, v_key);
    ELSIF v_key IN ('sort_order', 'value', 'latitude', 'longitude') THEN
      v_set_parts := v_set_parts || format('%I = ($1->>%L)::numeric', v_key, v_key);
    ELSIF v_key = 'due_date' THEN
      v_set_parts := v_set_parts || format('%I = ($1->>%L)::date', v_key, v_key);
    ELSE
      v_set_parts := v_set_parts || format('%I = ($1->>%L)::text', v_key, v_key);
    END IF;
  END LOOP;

  IF array_length(v_set_parts, 1) IS NULL THEN
    RAISE EXCEPTION 'No fields to update';
  END IF;

  v_set_clause := array_to_string(v_set_parts, ', ');

  EXECUTE format(
    'UPDATE %I SET %s, updated_at = now() WHERE id = $2 AND tenant_id = $3 RETURNING to_jsonb(%I.*)',
    p_table, v_set_clause, p_table
  ) USING p_fields, p_entity_id, p_tenant_id INTO v_result;

  IF v_result IS NULL THEN RAISE EXCEPTION 'Entity not found or access denied'; END IF;

  INSERT INTO activity_log (tenant_id, entity_type, entity_id, event_type, actor_id, actor_type)
  VALUES (p_tenant_id, p_table, p_entity_id, 'updated', p_actor_id,
    (SELECT CASE WHEN EXISTS(SELECT 1 FROM agents WHERE id = p_actor_id AND revoked_at IS NULL)
                 THEN 'agent' ELSE 'human' END));

  RETURN v_result;
END; $f$;
