-- Migration 041: Drop dead/unused tables
-- Verified: zero references in app code for all of these

-- Old CRM join tables (replaced by entity_links in migration 021)
DROP TABLE IF EXISTS people_companies CASCADE;
DROP TABLE IF EXISTS deals_companies CASCADE;
DROP TABLE IF EXISTS deals_people CASCADE;

-- Notifications table (never used — no API, no UI)
DROP TABLE IF EXISTS notifications CASCADE;
