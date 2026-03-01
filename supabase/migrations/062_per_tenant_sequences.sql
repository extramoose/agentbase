-- Per-tenant sequential IDs for tasks, companies, people, deals, library_items

-- Generic trigger function: sets ticket_id/seq_id to max+1 within tenant
CREATE OR REPLACE FUNCTION set_per_tenant_seq()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_col text;
  v_max int;
BEGIN
  -- Determine column name (tasks use ticket_id, others use seq_id)
  v_col := CASE TG_TABLE_NAME WHEN 'tasks' THEN 'ticket_id' ELSE 'seq_id' END;
  
  EXECUTE format(
    'SELECT COALESCE(MAX(%I), 0) + 1 FROM %I WHERE tenant_id = $1 FOR UPDATE',
    v_col, TG_TABLE_NAME
  ) USING NEW.tenant_id INTO v_max;
  
  IF TG_TABLE_NAME = 'tasks' THEN
    NEW.ticket_id := v_max;
  ELSE
    NEW.seq_id := v_max;
  END IF;
  
  RETURN NEW;
END;
$$;

-- But wait: tasks.ticket_id is GENERATED ALWAYS AS IDENTITY — can't override via trigger
-- Need to change it to a regular integer column first

-- tasks: drop identity, add trigger
ALTER TABLE tasks ALTER COLUMN ticket_id DROP IDENTITY IF EXISTS;
ALTER TABLE tasks ALTER COLUMN ticket_id SET DEFAULT 0;

CREATE TRIGGER trg_tasks_per_tenant_seq
  BEFORE INSERT ON tasks FOR EACH ROW
  EXECUTE FUNCTION set_per_tenant_seq();

-- companies
CREATE TRIGGER trg_companies_per_tenant_seq
  BEFORE INSERT ON companies FOR EACH ROW
  EXECUTE FUNCTION set_per_tenant_seq();

-- people
CREATE TRIGGER trg_people_per_tenant_seq
  BEFORE INSERT ON people FOR EACH ROW
  EXECUTE FUNCTION set_per_tenant_seq();

-- deals
CREATE TRIGGER trg_deals_per_tenant_seq
  BEFORE INSERT ON deals FOR EACH ROW
  EXECUTE FUNCTION set_per_tenant_seq();

-- library_items
CREATE TRIGGER trg_library_per_tenant_seq
  BEFORE INSERT ON library_items FOR EACH ROW
  EXECUTE FUNCTION set_per_tenant_seq();

-- Renumber Testy workspace (e7f76a05-cce6-4710-98f4-aee0c704bd8c)
-- Tasks
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) AS rn
  FROM tasks WHERE tenant_id = 'e7f76a05-cce6-4710-98f4-aee0c704bd8c'
)
UPDATE tasks SET ticket_id = numbered.rn
FROM numbered WHERE tasks.id = numbered.id;

-- Companies
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) AS rn
  FROM companies WHERE tenant_id = 'e7f76a05-cce6-4710-98f4-aee0c704bd8c'
)
UPDATE companies SET seq_id = numbered.rn
FROM numbered WHERE companies.id = numbered.id;

-- People
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) AS rn
  FROM people WHERE tenant_id = 'e7f76a05-cce6-4710-98f4-aee0c704bd8c'
)
UPDATE people SET seq_id = numbered.rn
FROM numbered WHERE people.id = numbered.id;

-- Deals
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) AS rn
  FROM deals WHERE tenant_id = 'e7f76a05-cce6-4710-98f4-aee0c704bd8c'
)
UPDATE deals SET seq_id = numbered.rn
FROM numbered WHERE deals.id = numbered.id;

-- Library
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) AS rn
  FROM library_items WHERE tenant_id = 'e7f76a05-cce6-4710-98f4-aee0c704bd8c'
)
UPDATE library_items SET seq_id = numbered.rn
FROM numbered WHERE library_items.id = numbered.id;

NOTIFY pgrst, 'reload schema';
