-- Migration 029: Drop grocery_items table entirely
-- Grocery feature removed from platform. No data worth keeping.
DROP TABLE IF EXISTS grocery_items CASCADE;

-- Drop any related RPCs
DROP FUNCTION IF EXISTS rpc_list_grocery_items(uuid) CASCADE;
DROP FUNCTION IF EXISTS rpc_create_grocery_item(uuid, text, text, boolean) CASCADE;
