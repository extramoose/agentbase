-- 047_deal_pipeline_statuses.sql
-- Fix deal pipeline statuses (#152)
-- New statuses: cold, prospect, warm, active, won, lost, paused, archived

-- Migrate existing rows that no longer exist in the new constraint
UPDATE deals SET status = 'warm' WHERE status IN ('qualified', 'proposal', 'negotiation');

-- Drop old constraint, add new one
ALTER TABLE deals DROP CONSTRAINT IF EXISTS deals_status_check;
ALTER TABLE deals ADD CONSTRAINT deals_status_check
  CHECK (status IN ('cold', 'prospect', 'warm', 'active', 'won', 'lost', 'paused', 'archived'));
