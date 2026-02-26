-- 004_schema_fixes.sql
-- Fixes schema mismatches between 001_initial_schema.sql and what was applied.

-- people: replace `role` with `phone` + `title` (matches CRM client)
ALTER TABLE people ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE people ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE people DROP COLUMN IF EXISTS role;

-- deals: fix status values to match client (prospect/active/won/lost)
ALTER TABLE deals DROP CONSTRAINT IF EXISTS deals_status_check;
ALTER TABLE deals ADD CONSTRAINT deals_status_check
  CHECK (status IN ('prospect', 'active', 'won', 'lost'));
ALTER TABLE deals ALTER COLUMN status SET DEFAULT 'prospect';
