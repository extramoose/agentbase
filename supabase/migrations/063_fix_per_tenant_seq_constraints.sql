-- First: drop identity on tasks.ticket_id (062 may not have run)
ALTER TABLE tasks ALTER COLUMN ticket_id DROP IDENTITY IF EXISTS;
ALTER TABLE tasks ALTER COLUMN ticket_id SET DEFAULT 0;

-- Fix: replace global unique constraints with per-tenant unique on seq_id/ticket_id

-- Drop global unique constraints
ALTER TABLE companies DROP CONSTRAINT IF EXISTS companies_seq_id_key;
ALTER TABLE people DROP CONSTRAINT IF EXISTS people_seq_id_key;
ALTER TABLE deals DROP CONSTRAINT IF EXISTS deals_seq_id_key;
ALTER TABLE library_items DROP CONSTRAINT IF EXISTS library_items_seq_id_key;

-- Drop global sequences (no longer needed, trigger handles it)
DROP SEQUENCE IF EXISTS companies_seq_id_seq CASCADE;
DROP SEQUENCE IF EXISTS people_seq_id_seq CASCADE;
DROP SEQUENCE IF EXISTS deals_seq_id_seq CASCADE;
DROP SEQUENCE IF EXISTS library_items_seq_id_seq CASCADE;

-- Remove default nextval (trigger handles assignment now)
ALTER TABLE companies ALTER COLUMN seq_id DROP DEFAULT;
ALTER TABLE people ALTER COLUMN seq_id DROP DEFAULT;
ALTER TABLE deals ALTER COLUMN seq_id DROP DEFAULT;
ALTER TABLE library_items ALTER COLUMN seq_id DROP DEFAULT;

-- Add per-tenant unique constraints
ALTER TABLE tasks ADD CONSTRAINT tasks_tenant_ticket_id_unique UNIQUE (tenant_id, ticket_id);
ALTER TABLE companies ADD CONSTRAINT companies_tenant_seq_id_unique UNIQUE (tenant_id, seq_id);
ALTER TABLE people ADD CONSTRAINT people_tenant_seq_id_unique UNIQUE (tenant_id, seq_id);
ALTER TABLE deals ADD CONSTRAINT deals_tenant_seq_id_unique UNIQUE (tenant_id, seq_id);
ALTER TABLE library_items ADD CONSTRAINT library_items_tenant_seq_id_unique UNIQUE (tenant_id, seq_id);

-- Now renumber Testy workspace
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) AS rn
  FROM companies WHERE tenant_id = 'e7f76a05-cce6-4710-98f4-aee0c704bd8c'
)
UPDATE companies SET seq_id = numbered.rn FROM numbered WHERE companies.id = numbered.id;

WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) AS rn
  FROM people WHERE tenant_id = 'e7f76a05-cce6-4710-98f4-aee0c704bd8c'
)
UPDATE people SET seq_id = numbered.rn FROM numbered WHERE people.id = numbered.id;

WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) AS rn
  FROM deals WHERE tenant_id = 'e7f76a05-cce6-4710-98f4-aee0c704bd8c'
)
UPDATE deals SET seq_id = numbered.rn FROM numbered WHERE deals.id = numbered.id;

WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) AS rn
  FROM library_items WHERE tenant_id = 'e7f76a05-cce6-4710-98f4-aee0c704bd8c'
)
UPDATE library_items SET seq_id = numbered.rn FROM numbered WHERE library_items.id = numbered.id;

WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) AS rn
  FROM tasks WHERE tenant_id = 'e7f76a05-cce6-4710-98f4-aee0c704bd8c'
)
UPDATE tasks SET ticket_id = numbered.rn FROM numbered WHERE tasks.id = numbered.id;

NOTIFY pgrst, 'reload schema';
