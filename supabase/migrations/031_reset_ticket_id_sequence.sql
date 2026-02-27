-- Migration 031: Reset ticket_id sequence to 1
-- Tasks table was wiped clean on 2026-02-27 for a fresh start.
-- This resets the identity sequence so the first new task gets ticket_id = 1.

ALTER TABLE tasks ALTER COLUMN ticket_id RESTART WITH 1;
