-- 048: Add soft-delete column to CRM + library tables (not tasks)
ALTER TABLE companies     ADD COLUMN deleted_at timestamptz DEFAULT NULL;
ALTER TABLE people        ADD COLUMN deleted_at timestamptz DEFAULT NULL;
ALTER TABLE deals         ADD COLUMN deleted_at timestamptz DEFAULT NULL;
ALTER TABLE library_items ADD COLUMN deleted_at timestamptz DEFAULT NULL;
