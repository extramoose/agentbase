-- Add p_tags and p_due_date params to rpc_create_task
CREATE OR REPLACE FUNCTION public.rpc_create_task(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_actor_type text,
  p_title text,
  p_priority text DEFAULT 'medium'::text,
  p_status text DEFAULT 'todo'::text,
  p_body text DEFAULT NULL::text,
  p_assignee_id uuid DEFAULT NULL::uuid,
  p_assignee_type text DEFAULT NULL::text,
  p_type text DEFAULT NULL::text,
  p_idempotency_key text DEFAULT NULL::text,
  p_tags text[] DEFAULT NULL,
  p_due_date date DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_result jsonb;
  v_existing jsonb;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    SELECT response_body INTO v_existing FROM idempotency_keys WHERE key = p_idempotency_key;
    IF FOUND THEN
      RETURN v_existing;
    END IF;
  END IF;

  INSERT INTO tasks (tenant_id, title, priority, status, body, assignee_id, assignee_type, type, tags, due_date)
  VALUES (p_tenant_id, p_title, p_priority, p_status, p_body, p_assignee_id, p_assignee_type, p_type, p_tags, p_due_date)
  RETURNING id INTO v_id;

  INSERT INTO activity_log (tenant_id, entity_type, entity_id, entity_label, event_type, actor_id, actor_type)
  VALUES (p_tenant_id, 'tasks', v_id, p_title, 'created', p_actor_id, p_actor_type);

  SELECT to_jsonb(t.*) INTO v_result FROM tasks t WHERE t.id = v_id;

  IF p_idempotency_key IS NOT NULL THEN
    INSERT INTO idempotency_keys (key, response_body)
    VALUES (p_idempotency_key, v_result)
    ON CONFLICT (key) DO NOTHING;
  END IF;

  RETURN v_result;
END;
$function$;

NOTIFY pgrst, 'reload schema';
