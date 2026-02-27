-- Migration 028: Sequential IDs for Library, CRM entities
-- Extends the ticket_id pattern from tasks to library_items, companies, people, deals.
-- These seq_ids will be used in URLs instead of UUIDs.

-- ─── library_items ────────────────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS library_items_seq_id_seq;
ALTER TABLE library_items ADD COLUMN IF NOT EXISTS seq_id integer UNIQUE DEFAULT nextval('library_items_seq_id_seq');
UPDATE library_items SET seq_id = nextval('library_items_seq_id_seq') WHERE seq_id IS NULL;
ALTER TABLE library_items ALTER COLUMN seq_id SET NOT NULL;

-- ─── companies ────────────────────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS companies_seq_id_seq;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS seq_id integer UNIQUE DEFAULT nextval('companies_seq_id_seq');
UPDATE companies SET seq_id = nextval('companies_seq_id_seq') WHERE seq_id IS NULL;
ALTER TABLE companies ALTER COLUMN seq_id SET NOT NULL;

-- ─── people ───────────────────────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS people_seq_id_seq;
ALTER TABLE people ADD COLUMN IF NOT EXISTS seq_id integer UNIQUE DEFAULT nextval('people_seq_id_seq');
UPDATE people SET seq_id = nextval('people_seq_id_seq') WHERE seq_id IS NULL;
ALTER TABLE people ALTER COLUMN seq_id SET NOT NULL;

-- ─── deals ────────────────────────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS deals_seq_id_seq;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS seq_id integer UNIQUE DEFAULT nextval('deals_seq_id_seq');
UPDATE deals SET seq_id = nextval('deals_seq_id_seq') WHERE seq_id IS NULL;
ALTER TABLE deals ALTER COLUMN seq_id SET NOT NULL;
