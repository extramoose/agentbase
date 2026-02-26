-- 009_agent_read_support.sql
-- Fix rpc_add_comment (agent_owners → agents)
-- Add rpc_list_* SECURITY DEFINER RPCs for all entity types so agents can read

-- Fix rpc_add_comment
CREATE OR REPLACE FUNCTION rpc_add_comment(
  p_entity_type text, p_entity_id uuid, p_entity_label text,
  p_body text, p_actor_id uuid, p_tenant_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE v_result jsonb;
BEGIN
  INSERT INTO activity_log (
    tenant_id, entity_type, entity_id, entity_label,
    event_type, actor_id, actor_type, body
  ) VALUES (
    p_tenant_id, p_entity_type, p_entity_id, p_entity_label, 'commented', p_actor_id,
    (SELECT CASE WHEN EXISTS(SELECT 1 FROM agents WHERE id = p_actor_id AND revoked_at IS NULL)
                 THEN 'agent' ELSE 'human' END),
    p_body
  ) RETURNING to_jsonb(activity_log.*) INTO v_result;
  RETURN v_result;
END; $f$;

-- List RPCs — no auth check needed (Bearer already validated by route handler)
-- SECURITY DEFINER runs as postgres → bypasses RLS for agent anon client

CREATE OR REPLACE FUNCTION rpc_list_tasks(p_tenant_id uuid)
RETURNS SETOF tasks LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT * FROM tasks WHERE tenant_id = p_tenant_id
  ORDER BY sort_order ASC, created_at DESC;
$$;

CREATE OR REPLACE FUNCTION rpc_list_meetings(p_tenant_id uuid)
RETURNS SETOF meetings LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT * FROM meetings WHERE tenant_id = p_tenant_id
  ORDER BY date DESC NULLS LAST, created_at DESC;
$$;

CREATE OR REPLACE FUNCTION rpc_list_library_items(p_tenant_id uuid)
RETURNS SETOF library_items LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT * FROM library_items WHERE tenant_id = p_tenant_id
  ORDER BY created_at DESC;
$$;

CREATE OR REPLACE FUNCTION rpc_list_diary_entries(p_tenant_id uuid)
RETURNS SETOF diary_entries LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT * FROM diary_entries WHERE tenant_id = p_tenant_id
  ORDER BY date DESC;
$$;

CREATE OR REPLACE FUNCTION rpc_list_grocery_items(p_tenant_id uuid)
RETURNS SETOF grocery_items LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT * FROM grocery_items WHERE tenant_id = p_tenant_id
  ORDER BY sort_order ASC, created_at ASC;
$$;

CREATE OR REPLACE FUNCTION rpc_list_companies(p_tenant_id uuid)
RETURNS SETOF companies LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT * FROM companies WHERE tenant_id = p_tenant_id ORDER BY name;
$$;

CREATE OR REPLACE FUNCTION rpc_list_people(p_tenant_id uuid)
RETURNS SETOF people LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT * FROM people WHERE tenant_id = p_tenant_id ORDER BY name;
$$;

CREATE OR REPLACE FUNCTION rpc_list_deals(p_tenant_id uuid)
RETURNS SETOF deals LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT * FROM deals WHERE tenant_id = p_tenant_id ORDER BY created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION rpc_add_comment(text,uuid,text,text,uuid,uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION rpc_list_tasks(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION rpc_list_meetings(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION rpc_list_library_items(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION rpc_list_diary_entries(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION rpc_list_grocery_items(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION rpc_list_companies(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION rpc_list_people(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION rpc_list_deals(uuid) TO authenticated, anon;
