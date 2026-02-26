-- Migration 008: Drop FK constraint on activity_log.actor_id
--
-- activity_log.actor_id referenced auth.users(id), which breaks agent mutations
-- because agents live in the agents table, not auth.users.
-- actor_type column already distinguishes 'human' vs 'agent' — no FK needed.

ALTER TABLE activity_log
  DROP CONSTRAINT IF EXISTS activity_log_actor_id_fkey;
