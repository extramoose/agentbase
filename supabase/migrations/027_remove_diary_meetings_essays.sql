-- Migration 027: Remove diary, meetings, and essays
-- These features have been removed from the product. Drop all related tables and RPCs.
-- Core platform: Tasks, Library, CRM, Grocery, History, Admin.

-- ─── Drop junction tables first (FK dependencies) ─────────────────────────
DROP TABLE IF EXISTS meetings_people CASCADE;
DROP TABLE IF EXISTS meetings_companies CASCADE;

-- ─── Drop feature tables ───────────────────────────────────────────────────
DROP TABLE IF EXISTS meetings CASCADE;
DROP TABLE IF EXISTS diary_entries CASCADE;
DROP TABLE IF EXISTS essays CASCADE;
DROP TABLE IF EXISTS stream_entries CASCADE;
DROP TABLE IF EXISTS document_versions CASCADE;

-- ─── Drop RPCs ─────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS rpc_create_meeting(uuid, text, text, uuid, text);
DROP FUNCTION IF EXISTS rpc_upsert_diary_entry(uuid, date, text, text, uuid, text);
DROP FUNCTION IF EXISTS rpc_list_stream_entries(uuid, text, uuid);
DROP FUNCTION IF EXISTS rpc_create_stream_entry(uuid, text, uuid, text, text, uuid, text);
DROP FUNCTION IF EXISTS rpc_list_document_versions(uuid, text, uuid);
DROP FUNCTION IF EXISTS rpc_create_essay(uuid, text, uuid, text);
DROP FUNCTION IF EXISTS rpc_list_essays(uuid);
DROP FUNCTION IF EXISTS rpc_get_essay(uuid, uuid);
DROP FUNCTION IF EXISTS rpc_get_diary_entry_id(uuid, date);
DROP FUNCTION IF EXISTS rpc_save_document_synthesis(uuid, text, uuid, text, uuid, text);
