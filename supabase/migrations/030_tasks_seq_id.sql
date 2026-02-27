-- Migration 030: Add seq_id to tasks (mirrors ticket_id)
-- Migration 028 added seq_id to library_items, companies, people, and deals
-- but tasks were skipped because they already had ticket_id.
-- This adds seq_id as a unified column so all entities share the same interface,
-- which is required for the EntityClient refactor URL pattern (?id=[seq_id]).

-- Add the column
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS seq_id integer;

-- Backfill existing rows
UPDATE tasks SET seq_id = ticket_id WHERE seq_id IS NULL;

-- BEFORE INSERT trigger: identity column values are assigned before BEFORE triggers fire,
-- so NEW.ticket_id is available and we can mirror it into seq_id.
CREATE OR REPLACE FUNCTION tasks_sync_seq_id()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.seq_id = NEW.ticket_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tasks_sync_seq_id_trigger ON tasks;
CREATE TRIGGER tasks_sync_seq_id_trigger
  BEFORE INSERT ON tasks
  FOR EACH ROW EXECUTE FUNCTION tasks_sync_seq_id();
