-- Fix: trigger needs SECURITY DEFINER to bypass RLS

CREATE OR REPLACE FUNCTION set_per_tenant_seq()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_max int;
BEGIN
  IF TG_TABLE_NAME = 'tasks' THEN
    SELECT COALESCE(MAX(ticket_id), 0) + 1 INTO v_max
    FROM tasks WHERE tenant_id = NEW.tenant_id;
    NEW.ticket_id := v_max;
  ELSE
    EXECUTE format(
      'SELECT COALESCE(MAX(seq_id), 0) + 1 FROM %I WHERE tenant_id = $1',
      TG_TABLE_NAME
    ) USING NEW.tenant_id INTO v_max;
    NEW.seq_id := v_max;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Fix the two #0 tasks
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) AS rn
  FROM tasks 
  WHERE tenant_id = '77be9bb4-f884-41e3-b49f-460811db1e2e' AND ticket_id = 0
)
UPDATE tasks SET ticket_id = (
  SELECT COALESCE(MAX(ticket_id), 0) FROM tasks 
  WHERE tenant_id = '77be9bb4-f884-41e3-b49f-460811db1e2e' AND ticket_id > 0
) + numbered.rn
FROM numbered WHERE tasks.id = numbered.id;

NOTIFY pgrst, 'reload schema';
