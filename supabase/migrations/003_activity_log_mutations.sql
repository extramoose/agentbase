-- Ticket #185: Unified mutation RPCs with atomic activity_log writes

-- rpc_create_task
CREATE OR REPLACE FUNCTION rpc_create_task(
  p_tenant_id uuid, p_actor_id uuid, p_actor_type text,
  p_title text, p_priority text DEFAULT 'medium',
  p_status text DEFAULT 'todo', p_body text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE v_id uuid; v_result jsonb;
BEGIN
  INSERT INTO tasks (tenant_id, title, priority, status, body)
  VALUES (p_tenant_id, p_title, p_priority, p_status, p_body)
  RETURNING id INTO v_id;
  INSERT INTO activity_log (tenant_id, entity_type, entity_id, entity_label, event_type, actor_id, actor_type)
  VALUES (p_tenant_id, 'tasks', v_id, p_title, 'created', p_actor_id, p_actor_type);
  SELECT to_jsonb(t.*) INTO v_result FROM tasks t WHERE t.id = v_id;
  RETURN v_result;
END; $f$;

-- rpc_create_meeting
CREATE OR REPLACE FUNCTION rpc_create_meeting(
  p_tenant_id uuid, p_actor_id uuid, p_actor_type text,
  p_title text, p_date date DEFAULT NULL,
  p_meeting_time time DEFAULT NULL, p_tags text[] DEFAULT '{}'
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE v_id uuid; v_result jsonb;
BEGIN
  INSERT INTO meetings (tenant_id, title, date, meeting_time, tags)
  VALUES (p_tenant_id, p_title, p_date, p_meeting_time, p_tags)
  RETURNING id INTO v_id;
  INSERT INTO activity_log (tenant_id, entity_type, entity_id, entity_label, event_type, actor_id, actor_type)
  VALUES (p_tenant_id, 'meetings', v_id, p_title, 'created', p_actor_id, p_actor_type);
  SELECT to_jsonb(m.*) INTO v_result FROM meetings m WHERE m.id = v_id;
  RETURN v_result;
END; $f$;

-- rpc_create_library_item
CREATE OR REPLACE FUNCTION rpc_create_library_item(
  p_tenant_id uuid, p_actor_id uuid, p_actor_type text,
  p_type text, p_title text,
  p_url text DEFAULT NULL, p_body text DEFAULT NULL,
  p_source text DEFAULT NULL, p_excerpt text DEFAULT NULL,
  p_location_name text DEFAULT NULL,
  p_latitude numeric DEFAULT NULL, p_longitude numeric DEFAULT NULL,
  p_tags text[] DEFAULT '{}', p_is_public boolean DEFAULT false
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE v_id uuid; v_result jsonb;
BEGIN
  INSERT INTO library_items (tenant_id, type, title, url, body, source, excerpt, location_name, latitude, longitude, tags, is_public)
  VALUES (p_tenant_id, p_type, p_title, p_url, p_body, p_source, p_excerpt, p_location_name, p_latitude, p_longitude, p_tags, p_is_public)
  RETURNING id INTO v_id;
  INSERT INTO activity_log (tenant_id, entity_type, entity_id, entity_label, event_type, actor_id, actor_type)
  VALUES (p_tenant_id, 'library_items', v_id, p_title, 'created', p_actor_id, p_actor_type);
  SELECT to_jsonb(l.*) INTO v_result FROM library_items l WHERE l.id = v_id;
  RETURN v_result;
END; $f$;

-- rpc_upsert_diary_entry
CREATE OR REPLACE FUNCTION rpc_upsert_diary_entry(
  p_tenant_id uuid, p_actor_id uuid, p_actor_type text,
  p_date date, p_content text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE v_id uuid; v_result jsonb; v_is_new boolean;
BEGIN
  SELECT id INTO v_id FROM diary_entries WHERE tenant_id = p_tenant_id AND date = p_date;
  v_is_new := v_id IS NULL;
  INSERT INTO diary_entries (tenant_id, date, content)
  VALUES (p_tenant_id, p_date, p_content)
  ON CONFLICT (tenant_id, date) DO UPDATE SET content = EXCLUDED.content, updated_at = now()
  RETURNING id INTO v_id;
  INSERT INTO activity_log (tenant_id, entity_type, entity_id, entity_label, event_type, actor_id, actor_type)
  VALUES (p_tenant_id, 'diary_entries', v_id, p_date::text,
    CASE WHEN v_is_new THEN 'created' ELSE 'updated' END,
    p_actor_id, p_actor_type);
  SELECT to_jsonb(d.*) INTO v_result FROM diary_entries d WHERE d.id = v_id;
  RETURN v_result;
END; $f$;

-- rpc_create_grocery_item
CREATE OR REPLACE FUNCTION rpc_create_grocery_item(
  p_tenant_id uuid, p_actor_id uuid, p_actor_type text,
  p_name text, p_category text DEFAULT NULL, p_quantity text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE v_id uuid; v_result jsonb;
BEGIN
  INSERT INTO grocery_items (tenant_id, name, category, quantity)
  VALUES (p_tenant_id, p_name, p_category, p_quantity)
  RETURNING id INTO v_id;
  INSERT INTO activity_log (tenant_id, entity_type, entity_id, entity_label, event_type, actor_id, actor_type)
  VALUES (p_tenant_id, 'grocery_items', v_id, p_name, 'created', p_actor_id, p_actor_type);
  SELECT to_jsonb(g.*) INTO v_result FROM grocery_items g WHERE g.id = v_id;
  RETURN v_result;
END; $f$;

-- rpc_create_company
CREATE OR REPLACE FUNCTION rpc_create_company(
  p_tenant_id uuid, p_actor_id uuid, p_actor_type text,
  p_name text, p_domain text DEFAULT NULL,
  p_industry text DEFAULT NULL, p_notes text DEFAULT NULL,
  p_tags text[] DEFAULT '{}'
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE v_id uuid; v_result jsonb;
BEGIN
  INSERT INTO companies (tenant_id, name, domain, industry, notes, tags)
  VALUES (p_tenant_id, p_name, p_domain, p_industry, p_notes, p_tags)
  RETURNING id INTO v_id;
  INSERT INTO activity_log (tenant_id, entity_type, entity_id, entity_label, event_type, actor_id, actor_type)
  VALUES (p_tenant_id, 'companies', v_id, p_name, 'created', p_actor_id, p_actor_type);
  SELECT to_jsonb(c.*) INTO v_result FROM companies c WHERE c.id = v_id;
  RETURN v_result;
END; $f$;

-- rpc_create_person
CREATE OR REPLACE FUNCTION rpc_create_person(
  p_tenant_id uuid, p_actor_id uuid, p_actor_type text,
  p_name text, p_email text DEFAULT NULL, p_phone text DEFAULT NULL,
  p_title text DEFAULT NULL, p_notes text DEFAULT NULL,
  p_tags text[] DEFAULT '{}'
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE v_id uuid; v_result jsonb;
BEGIN
  INSERT INTO people (tenant_id, name, email, phone, title, notes, tags)
  VALUES (p_tenant_id, p_name, p_email, p_phone, p_title, p_notes, p_tags)
  RETURNING id INTO v_id;
  INSERT INTO activity_log (tenant_id, entity_type, entity_id, entity_label, event_type, actor_id, actor_type)
  VALUES (p_tenant_id, 'people', v_id, p_name, 'created', p_actor_id, p_actor_type);
  SELECT to_jsonb(p.*) INTO v_result FROM people p WHERE p.id = v_id;
  RETURN v_result;
END; $f$;

-- rpc_create_deal
CREATE OR REPLACE FUNCTION rpc_create_deal(
  p_tenant_id uuid, p_actor_id uuid, p_actor_type text,
  p_title text, p_status text DEFAULT 'prospect',
  p_value numeric DEFAULT NULL, p_notes text DEFAULT NULL,
  p_tags text[] DEFAULT '{}'
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE v_id uuid; v_result jsonb;
BEGIN
  INSERT INTO deals (tenant_id, title, status, value, notes, tags)
  VALUES (p_tenant_id, p_title, p_status, p_value, p_notes, p_tags)
  RETURNING id INTO v_id;
  INSERT INTO activity_log (tenant_id, entity_type, entity_id, entity_label, event_type, actor_id, actor_type)
  VALUES (p_tenant_id, 'deals', v_id, p_title, 'created', p_actor_id, p_actor_type);
  SELECT to_jsonb(d.*) INTO v_result FROM deals d WHERE d.id = v_id;
  RETURN v_result;
END; $f$;

-- rpc_delete_entity (generic, per-table label lookup)
CREATE OR REPLACE FUNCTION rpc_delete_entity(
  p_table text, p_entity_id uuid,
  p_actor_id uuid, p_actor_type text, p_tenant_id uuid
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE
  v_allowed text[] := ARRAY['tasks','meetings','library_items','diary_entries','grocery_items','companies','people','deals'];
  v_label text;
BEGIN
  IF NOT (p_table = ANY(v_allowed)) THEN
    RAISE EXCEPTION 'Table % not allowed', p_table;
  END IF;
  -- Per-table label: each table has different label column (title vs name vs date)
  v_label := CASE p_table
    WHEN 'tasks'         THEN (SELECT title FROM tasks         WHERE id = p_entity_id AND tenant_id = p_tenant_id)
    WHEN 'meetings'      THEN (SELECT title FROM meetings      WHERE id = p_entity_id AND tenant_id = p_tenant_id)
    WHEN 'library_items' THEN (SELECT title FROM library_items WHERE id = p_entity_id AND tenant_id = p_tenant_id)
    WHEN 'diary_entries' THEN (SELECT date::text FROM diary_entries WHERE id = p_entity_id AND tenant_id = p_tenant_id)
    WHEN 'grocery_items' THEN (SELECT name  FROM grocery_items WHERE id = p_entity_id AND tenant_id = p_tenant_id)
    WHEN 'companies'     THEN (SELECT name  FROM companies     WHERE id = p_entity_id AND tenant_id = p_tenant_id)
    WHEN 'people'        THEN (SELECT name  FROM people        WHERE id = p_entity_id AND tenant_id = p_tenant_id)
    WHEN 'deals'         THEN (SELECT title FROM deals         WHERE id = p_entity_id AND tenant_id = p_tenant_id)
    ELSE p_entity_id::text
  END;
  EXECUTE format('DELETE FROM %I WHERE id = $1 AND tenant_id = $2', p_table)
  USING p_entity_id, p_tenant_id;
  INSERT INTO activity_log (tenant_id, entity_type, entity_id, entity_label, event_type, actor_id, actor_type)
  VALUES (p_tenant_id, p_table, p_entity_id, COALESCE(v_label, p_entity_id::text), 'deleted', p_actor_id, p_actor_type);
END; $f$;
