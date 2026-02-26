-- 012_task_type.sql
-- Add optional type field to tasks: bug | improvement | feature (nullable, default NULL).

-- Step 1: Add column
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS type text CHECK (type IN ('bug', 'improvement', 'feature')) DEFAULT NULL;

-- Step 2: Update rpc_create_task to accept p_type
CREATE OR REPLACE FUNCTION public.rpc_create_task(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_actor_type text,
  p_title text,
  p_priority text DEFAULT 'medium',
  p_status text DEFAULT 'todo',
  p_body text DEFAULT NULL,
  p_assignee_id uuid DEFAULT NULL,
  p_assignee_type text DEFAULT NULL,
  p_type text DEFAULT NULL
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
  INSERT INTO tasks (tenant_id, title, priority, status, body, assignee_id, assignee_type, type)
  VALUES (p_tenant_id, p_title, p_priority, p_status, p_body, p_assignee_id, p_assignee_type, p_type)
  RETURNING id INTO v_id;

  INSERT INTO activity_log (tenant_id, entity_type, entity_id, entity_label, event_type, actor_id, actor_type)
  VALUES (p_tenant_id, 'tasks', v_id, p_title, 'created', p_actor_id, p_actor_type);

  SELECT to_jsonb(t.*) INTO v_result FROM tasks t WHERE t.id = v_id;
  RETURN v_result;
END;
$function$;
