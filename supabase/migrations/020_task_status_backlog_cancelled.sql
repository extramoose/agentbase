-- Migration 020: Add backlog + cancelled to task status check constraint
-- Extends: tasks.status CHECK from (todo|in_progress|blocked|done) to include backlog + cancelled

ALTER TABLE tasks
  DROP CONSTRAINT IF EXISTS tasks_status_check;

ALTER TABLE tasks
  ADD CONSTRAINT tasks_status_check
    CHECK (status IN ('backlog', 'todo', 'in_progress', 'blocked', 'done', 'cancelled'));

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
