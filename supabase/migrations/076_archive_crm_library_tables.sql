-- Migration 076: Archive CRM + Library tables
-- CRM (companies, people, deals) and library_items have been removed from the app.
-- We move them to an `archive` schema rather than dropping, preserving data.

CREATE SCHEMA IF NOT EXISTS archive;

-- Move CRM junction tables first (they depend on main tables)
ALTER TABLE IF EXISTS deals_people        SET SCHEMA archive;
ALTER TABLE IF EXISTS deals_companies     SET SCHEMA archive;
ALTER TABLE IF EXISTS people_companies    SET SCHEMA archive;
ALTER TABLE IF EXISTS meetings_people     SET SCHEMA archive;
ALTER TABLE IF EXISTS meetings_companies  SET SCHEMA archive;

-- Move main CRM tables
ALTER TABLE IF EXISTS deals               SET SCHEMA archive;
ALTER TABLE IF EXISTS people              SET SCHEMA archive;
ALTER TABLE IF EXISTS companies           SET SCHEMA archive;

-- Move library
ALTER TABLE IF EXISTS library_items       SET SCHEMA archive;

NOTIFY pgrst, 'reload schema';
