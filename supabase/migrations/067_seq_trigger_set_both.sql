-- Fix: tasks have both ticket_id and seq_id — trigger must set both

CREATE OR REPLACE FUNCTION set_per_tenant_seq()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_max int;
BEGIN
  IF TG_TABLE_NAME = 'tasks' THEN
    SELECT COALESCE(MAX(ticket_id), 0) + 1 INTO v_max
    FROM tasks WHERE tenant_id = NEW.tenant_id;
    NEW.ticket_id := v_max;
    NEW.seq_id := v_max;
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

-- Fix any tasks where seq_id is null or 0
UPDATE tasks SET seq_id = ticket_id WHERE seq_id IS NULL OR seq_id = 0;

NOTIFY pgrst, 'reload schema';
