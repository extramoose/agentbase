-- 044_last_enriched.sql
-- Adds last_enriched timestamp to CRM entities for agent enrichment tracking.
-- Agents set this when they enrich a record so the UI can show recency.

ALTER TABLE companies ADD COLUMN IF NOT EXISTS last_enriched timestamptz DEFAULT NULL;
ALTER TABLE people    ADD COLUMN IF NOT EXISTS last_enriched timestamptz DEFAULT NULL;
ALTER TABLE deals     ADD COLUMN IF NOT EXISTS last_enriched timestamptz DEFAULT NULL;

COMMENT ON COLUMN companies.last_enriched IS 'Timestamp of the last agent enrichment run';
COMMENT ON COLUMN people.last_enriched    IS 'Timestamp of the last agent enrichment run';
COMMENT ON COLUMN deals.last_enriched     IS 'Timestamp of the last agent enrichment run';
