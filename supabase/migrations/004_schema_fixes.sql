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

-- companies: rename description→notes, add industry (matches CRM client)
ALTER TABLE companies RENAME COLUMN description TO notes;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS industry text;

-- library_items: rename description→body, lat→latitude, lng→longitude, add location_name
ALTER TABLE library_items RENAME COLUMN description TO body;
ALTER TABLE library_items RENAME COLUMN lat TO latitude;
ALTER TABLE library_items RENAME COLUMN lng TO longitude;
ALTER TABLE library_items ADD COLUMN IF NOT EXISTS location_name text;
