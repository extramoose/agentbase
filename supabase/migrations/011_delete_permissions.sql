-- Ticket #211: Delete permissions — move activity_log write out of rpc_delete_entity
-- Routes now capture entity label BEFORE deletion and log to activity_log directly.

CREATE OR REPLACE FUNCTION rpc_delete_entity(
  p_table text, p_entity_id uuid,
  p_actor_id uuid, p_actor_type text, p_tenant_id uuid
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE
  v_allowed text[] := ARRAY['tasks','meetings','library_items','diary_entries','grocery_items','companies','people','deals'];
BEGIN
  IF NOT (p_table = ANY(v_allowed)) THEN
    RAISE EXCEPTION 'Table % not allowed', p_table;
  END IF;
  EXECUTE format('DELETE FROM %I WHERE id = $1 AND tenant_id = $2', p_table)
  USING p_entity_id, p_tenant_id;
END; $f$;
