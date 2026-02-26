-- 008_rich_activity_diffs.sql
-- Rich activity copy: rpc_update_entity captures per-field diffs with semantic event types

-- Ensure payload column exists (already present, but safe guard)
ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS payload jsonb;

-- Replace rpc_update_entity with diff-capturing version
CREATE OR REPLACE FUNCTION rpc_update_entity(
  p_table text,
  p_entity_id uuid,
  p_fields jsonb,
  p_actor_id uuid,
  p_tenant_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE
  v_allowed_tables text[] := ARRAY['tasks','meetings','library_items','diary_entries','grocery_items','companies','people','deals'];
  v_protected_fields text[] := ARRAY['id','tenant_id','actor_id','created_at','ticket_id'];
  v_key text;
  v_set_parts text[] := ARRAY[]::text[];
  v_set_clause text;
  v_result jsonb;
  v_old_row jsonb;
  v_actor_type text;
  v_old_val text;
  v_new_val text;
  v_old_tags text[];
  v_new_tags text[];
  v_added_tags text[];
  v_removed_tags text[];
  v_event_type text;
  v_payload jsonb;
BEGIN
  IF NOT (p_table = ANY(v_allowed_tables)) THEN
    RAISE EXCEPTION 'Table % is not allowed for generic updates', p_table;
  END IF;

  -- Fetch current row for diff
  EXECUTE format('SELECT to_jsonb(%I.*) FROM %I WHERE id = $1 AND tenant_id = $2', p_table, p_table)
    USING p_entity_id, p_tenant_id INTO v_old_row;

  IF v_old_row IS NULL THEN
    RAISE EXCEPTION 'Entity not found or access denied';
  END IF;

  -- Determine actor type
  SELECT CASE WHEN EXISTS(SELECT 1 FROM agents WHERE id = p_actor_id AND revoked_at IS NULL)
    THEN 'agent' ELSE 'human' END INTO v_actor_type;

  -- Build SET clause
  FOR v_key IN SELECT jsonb_object_keys(p_fields) LOOP
    IF v_key = ANY(v_protected_fields) THEN
      RAISE EXCEPTION 'Field % cannot be updated via generic update route', v_key;
    END IF;

    IF v_key = 'tags' THEN
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

  IF v_result IS NULL THEN RAISE EXCEPTION 'Entity not found after update'; END IF;

  -- Emit activity events for each changed field
  FOR v_key IN SELECT jsonb_object_keys(p_fields) LOOP
    IF v_key = ANY(v_protected_fields) THEN CONTINUE; END IF;
    IF v_key = 'updated_at' THEN CONTINUE; END IF;

    IF v_key = 'tags' THEN
      -- Compute tag diff
      SELECT array_agg(t) INTO v_old_tags FROM jsonb_array_elements_text(COALESCE(v_old_row->'tags', '[]'::jsonb)) t;
      SELECT array_agg(t) INTO v_new_tags FROM jsonb_array_elements_text(p_fields->'tags') t;
      v_old_tags := COALESCE(v_old_tags, ARRAY[]::text[]);
      v_new_tags := COALESCE(v_new_tags, ARRAY[]::text[]);

      -- Added tags
      SELECT array_agg(t) INTO v_added_tags FROM unnest(v_new_tags) t WHERE NOT (t = ANY(v_old_tags));
      -- Removed tags
      SELECT array_agg(t) INTO v_removed_tags FROM unnest(v_old_tags) t WHERE NOT (t = ANY(v_new_tags));

      v_added_tags := COALESCE(v_added_tags, ARRAY[]::text[]);
      v_removed_tags := COALESCE(v_removed_tags, ARRAY[]::text[]);

      IF array_length(v_added_tags, 1) > 0 OR array_length(v_removed_tags, 1) > 0 THEN
        INSERT INTO activity_log (tenant_id, entity_type, entity_id, event_type, actor_id, actor_type, payload)
        VALUES (p_tenant_id, p_table, p_entity_id, 'tags_changed', p_actor_id, v_actor_type,
          jsonb_build_object('added', to_jsonb(v_added_tags), 'removed', to_jsonb(v_removed_tags)));
      END IF;
      CONTINUE;
    END IF;

    v_old_val := v_old_row ->> v_key;
    v_new_val := p_fields ->> v_key;

    -- Skip if unchanged
    IF v_old_val IS NOT DISTINCT FROM v_new_val THEN CONTINUE; END IF;

    -- Select semantic event_type
    v_event_type := CASE v_key
      WHEN 'status' THEN 'status_changed'
      WHEN 'priority' THEN 'priority_changed'
      WHEN 'title' THEN 'title_changed'
      WHEN 'name' THEN 'title_changed'
      WHEN 'due_date' THEN CASE WHEN v_new_val IS NULL THEN 'due_date_cleared' ELSE 'due_date_set' END
      ELSE 'field_updated'
    END;

    v_payload := jsonb_build_object('field', v_key, 'old', v_old_val, 'new', v_new_val);

    INSERT INTO activity_log (tenant_id, entity_type, entity_id, event_type, actor_id, actor_type, payload)
    VALUES (p_tenant_id, p_table, p_entity_id, v_event_type, p_actor_id, v_actor_type, v_payload);
  END LOOP;

  RETURN v_result;
END; $f$;
