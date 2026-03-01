-- The old tasks_sync_seq_id_trigger was overriding per-tenant trigger
DROP TRIGGER IF EXISTS tasks_sync_seq_id_trigger ON tasks;

-- Fix all #0 ticket_ids
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

-- Same for Testy
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) AS rn
  FROM tasks 
  WHERE tenant_id = 'e7f76a05-cce6-4710-98f4-aee0c704bd8c' AND ticket_id = 0
)
UPDATE tasks SET ticket_id = (
  SELECT COALESCE(MAX(ticket_id), 0) FROM tasks 
  WHERE tenant_id = 'e7f76a05-cce6-4710-98f4-aee0c704bd8c' AND ticket_id > 0
) + numbered.rn
FROM numbered WHERE tasks.id = numbered.id;

NOTIFY pgrst, 'reload schema';
