-- Migration 077: RLS + security audit cleanup post CRM/library removal (#355)
-- Migration 076 archived companies, people, deals, library_items to the archive
-- schema but left behind SECURITY DEFINER functions that still reference those
-- tables by unqualified name.  This migration:
--   1. Drops dead CRM/library CRUD RPCs (no callers remain)
--   2. Rewrites rpc_get_all_tags to only aggregate from tasks
--   3. Rewrites _entity_display_name to remove archived-table branches
--   4. Tightens rpc_update_entity + rpc_delete_entity allowlists to tasks-only
--   5. Disables RLS on archived tables (policies are stale / reference public fns)

-- ============================================================================
-- 1. Drop dead CRM/library CRUD + list RPCs
-- ============================================================================
DROP FUNCTION IF EXISTS rpc_list_companies(uuid);
DROP FUNCTION IF EXISTS rpc_list_people(uuid);
DROP FUNCTION IF EXISTS rpc_list_deals(uuid);
DROP FUNCTION IF EXISTS rpc_list_library_items(uuid);

DROP FUNCTION IF EXISTS rpc_create_person(
  uuid, uuid, text, text, text, text, text, text, text[], text, jsonb, jsonb, text, text, text, text
);
DROP FUNCTION IF EXISTS rpc_create_company(
  uuid, uuid, text, text, text, text, text, text[], text, text, text, text, text, text, text
);
DROP FUNCTION IF EXISTS rpc_create_deal(
  uuid, uuid, text, text, text, numeric, text, text[], text, date, text, uuid, date
);

-- ============================================================================
-- 2. Rewrite rpc_get_all_tags — tasks only
-- ============================================================================
CREATE OR REPLACE FUNCTION rpc_get_all_tags(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_result jsonb;
BEGIN
  WITH all_tags AS (
    SELECT unnest(tags) AS tag, 'tasks' AS entity_type
    FROM tasks WHERE tenant_id = p_tenant_id AND tags IS NOT NULL AND array_length(tags, 1) > 0
  ),
  counted AS (
    SELECT
      lower(tag) AS tag,
      count(*)::int AS count,
      jsonb_object_agg(
        entity_type,
        entity_count
      ) AS entities
    FROM (
      SELECT tag, entity_type, count(*)::int AS entity_count
      FROM all_tags
      GROUP BY tag, entity_type
    ) sub
    GROUP BY lower(tag)
    ORDER BY count(*) DESC, lower(tag)
  )
  SELECT coalesce(jsonb_agg(
    jsonb_build_object('tag', tag, 'count', count, 'entities', entities)
  ), '[]'::jsonb) INTO v_result
  FROM counted;

  RETURN v_result;
END;
$$;

-- ============================================================================
-- 3. Rewrite _entity_display_name — remove archived-table branches
-- ============================================================================
CREATE OR REPLACE FUNCTION _entity_display_name(p_type text, p_id uuid)
RETURNS text
LANGUAGE plpgsql STABLE
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_name text;
BEGIN
  CASE p_type
    WHEN 'tasks' THEN SELECT title INTO v_name FROM tasks WHERE id = p_id;
    ELSE v_name := NULL;
  END CASE;
  RETURN v_name;
END;
$$;

-- ============================================================================
-- 4. Tighten rpc_update_entity allowlist to tasks only
-- ============================================================================
CREATE OR REPLACE FUNCTION rpc_update_entity(
  p_table text,
  p_entity_id uuid,
  p_fields jsonb,
  p_actor_id uuid,
  p_tenant_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE
  v_allowed_tables text[] := ARRAY['tasks'];
  v_protected_fields text[] := ARRAY['id','tenant_id','actor_id','created_at','ticket_id'];
  v_activity_skip_fields text[] := ARRAY['assignee_type','sort_order','updated_at'];
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
  v_assignee_label text;
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
    ELSIF v_key IN ('due_date', 'expected_close_date') THEN
      v_set_parts := v_set_parts || format('%I = ($1->>%L)::date', v_key, v_key);
    ELSIF v_key IN ('last_enriched', 'deleted_at') THEN
      v_set_parts := v_set_parts || format('%I = ($1->>%L)::timestamptz', v_key, v_key);
    ELSIF v_key IN ('assignee_id', 'source_meeting_id', 'primary_contact_id') THEN
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

  -- Emit activity events for each changed field
  FOR v_key IN SELECT jsonb_object_keys(p_fields) LOOP
    IF v_key = ANY(v_protected_fields) THEN CONTINUE; END IF;
    IF v_key = ANY(v_activity_skip_fields) THEN CONTINUE; END IF;

    IF v_key = 'tags' THEN
      SELECT array_agg(t) INTO v_old_tags FROM jsonb_array_elements_text(COALESCE(NULLIF(v_old_row->'tags', 'null'::jsonb), '[]'::jsonb)) t;
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
      WHEN 'status'       THEN 'status_changed'
      WHEN 'priority'     THEN 'priority_changed'
      WHEN 'title'        THEN 'title_changed'
      WHEN 'name'         THEN 'title_changed'
      WHEN 'due_date'     THEN CASE WHEN v_new_val IS NULL THEN 'due_date_cleared' ELSE 'due_date_set' END
      WHEN 'assignee_id'  THEN 'assignee_changed'
      WHEN 'body'         THEN 'body_changed'
      WHEN 'notes'        THEN 'body_changed'
      ELSE 'field_updated'
    END;

    IF v_key IN ('body', 'notes') THEN
      v_payload := jsonb_build_object('field', v_key);
    ELSE
      v_payload := jsonb_build_object('field', v_key, 'old', v_old_val, 'new', v_new_val);
    END IF;

    -- Enrich assignee_changed with display name so history renders a name, not a UUID
    IF v_key = 'assignee_id' AND v_new_val IS NOT NULL THEN
      SELECT COALESCE(p.full_name, p.email) INTO v_assignee_label
        FROM profiles p WHERE p.id = v_new_val::uuid;
      IF v_assignee_label IS NULL THEN
        SELECT a.name INTO v_assignee_label FROM agents a WHERE a.id = v_new_val::uuid;
      END IF;
      IF v_assignee_label IS NOT NULL THEN
        v_payload := v_payload || jsonb_build_object('new_label', v_assignee_label);
      END IF;
    END IF;

    INSERT INTO activity_log (tenant_id, entity_type, entity_id, event_type, actor_id, actor_type, payload)
    VALUES (p_tenant_id, p_table, p_entity_id, v_event_type, p_actor_id, v_actor_type, v_payload);
  END LOOP;

  RETURN v_result;
END; $f$;

-- ============================================================================
-- 5. Tighten rpc_delete_entity allowlist to tasks only
-- ============================================================================
CREATE OR REPLACE FUNCTION rpc_delete_entity(
  p_table text, p_entity_id uuid,
  p_actor_id uuid, p_actor_type text, p_tenant_id uuid
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE
  v_allowed text[] := ARRAY['tasks'];
BEGIN
  IF NOT (p_table = ANY(v_allowed)) THEN
    RAISE EXCEPTION 'Table % not allowed', p_table;
  END IF;
  EXECUTE format('DELETE FROM %I WHERE id = $1 AND tenant_id = $2', p_table)
  USING p_entity_id, p_tenant_id;
END; $f$;

-- ============================================================================
-- 6. Disable RLS on archived tables (policies reference public-schema fns
--    like is_active_tenant / is_tenant_member that don't resolve correctly
--    in the archive schema context)
-- ============================================================================
ALTER TABLE IF EXISTS archive.companies        DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS archive.people           DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS archive.deals            DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS archive.library_items    DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS archive.people_companies DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS archive.deals_companies  DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS archive.deals_people     DISABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
