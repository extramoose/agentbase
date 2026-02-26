-- 010_task_assignee.sql
-- Add assignee_id + assignee_type to tasks table for proper actor references.
-- No FK constraint — assignee_id may reference either profiles or agents.

-- Step 1: Add columns
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS assignee_id uuid,
  ADD COLUMN IF NOT EXISTS assignee_type text CHECK (assignee_type IN ('human','agent'));

-- Step 2: Update rpc_create_task to accept assignee_id + assignee_type
CREATE OR REPLACE FUNCTION public.rpc_create_task(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_actor_type text,
  p_title text,
  p_priority text DEFAULT 'medium',
  p_status text DEFAULT 'todo',
  p_body text DEFAULT NULL,
  p_assignee_id uuid DEFAULT NULL,
  p_assignee_type text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_result jsonb;
BEGIN
  INSERT INTO tasks (tenant_id, title, priority, status, body, assignee_id, assignee_type)
  VALUES (p_tenant_id, p_title, p_priority, p_status, p_body, p_assignee_id, p_assignee_type)
  RETURNING id INTO v_id;

  INSERT INTO activity_log (tenant_id, entity_type, entity_id, entity_label, event_type, actor_id, actor_type)
  VALUES (p_tenant_id, 'tasks', v_id, p_title, 'created', p_actor_id, p_actor_type);

  SELECT to_jsonb(t.*) INTO v_result FROM tasks t WHERE t.id = v_id;
  RETURN v_result;
END;
$function$;

-- Step 3: Update rpc_update_entity — add uuid cast for assignee_id
CREATE OR REPLACE FUNCTION public.rpc_update_entity(
  p_table text,
  p_entity_id uuid,
  p_fields jsonb,
  p_actor_id uuid,
  p_tenant_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  EXECUTE format('SELECT to_jsonb(%I.*) FROM %I WHERE id = $1 AND tenant_id = $2', p_table, p_table)
    USING p_entity_id, p_tenant_id INTO v_old_row;

  IF v_old_row IS NULL THEN
    RAISE EXCEPTION 'Entity not found or access denied';
  END IF;

  SELECT CASE WHEN EXISTS(SELECT 1 FROM agents WHERE id = p_actor_id AND revoked_at IS NULL)
    THEN 'agent' ELSE 'human' END INTO v_actor_type;

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
    ELSIF v_key = 'assignee_id' THEN
      v_set_parts := v_set_parts || format('%I = ($1->>%L)::uuid', v_key, v_key);
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

  FOR v_key IN SELECT jsonb_object_keys(p_fields) LOOP
    IF v_key = ANY(v_protected_fields) THEN CONTINUE; END IF;
    IF v_key = 'updated_at' THEN CONTINUE; END IF;

    IF v_key = 'tags' THEN
      SELECT array_agg(t) INTO v_old_tags FROM jsonb_array_elements_text(COALESCE(v_old_row->'tags', '[]'::jsonb)) t;
      SELECT array_agg(t) INTO v_new_tags FROM jsonb_array_elements_text(p_fields->'tags') t;
      v_old_tags := COALESCE(v_old_tags, ARRAY[]::text[]);
      v_new_tags := COALESCE(v_new_tags, ARRAY[]::text[]);

      SELECT array_agg(t) INTO v_added_tags FROM unnest(v_new_tags) t WHERE NOT (t = ANY(v_old_tags));
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

    IF v_old_val IS NOT DISTINCT FROM v_new_val THEN CONTINUE; END IF;

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
END;
$function$;
