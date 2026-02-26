-- 007_workspace_settings.sql
-- Adds workspace settings columns to tenants table and RPCs
-- for reading/updating them (LLM gateway config + editable name).

-- 1. Add columns
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS openrouter_api_key text,
  ADD COLUMN IF NOT EXISTS default_model text NOT NULL DEFAULT 'openai/gpt-4o-mini';

-- 2. get_workspace_settings: returns tenant row for the current user's workspace
CREATE OR REPLACE FUNCTION get_workspace_settings()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE v_result jsonb;
BEGIN
  SELECT to_jsonb(t.*) INTO v_result
  FROM tenants t
  JOIN tenant_members tm ON tm.tenant_id = t.id
  WHERE tm.user_id = auth.uid()
  LIMIT 1;
  RETURN v_result;
END; $f$;
GRANT EXECUTE ON FUNCTION get_workspace_settings() TO authenticated;

-- 3. update_workspace_settings: superadmin only
CREATE OR REPLACE FUNCTION update_workspace_settings(
  p_name text DEFAULT NULL,
  p_openrouter_api_key text DEFAULT NULL,
  p_default_model text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE
  v_tenant_id uuid;
BEGIN
  IF NOT is_superadmin() THEN RAISE EXCEPTION 'Access denied'; END IF;
  SELECT tenant_id INTO v_tenant_id FROM tenant_members WHERE user_id = auth.uid() LIMIT 1;
  UPDATE tenants SET
    name = COALESCE(p_name, name),
    openrouter_api_key = COALESCE(p_openrouter_api_key, openrouter_api_key),
    default_model = COALESCE(p_default_model, default_model),
    updated_at = now()
  WHERE id = v_tenant_id;
END; $f$;
GRANT EXECUTE ON FUNCTION update_workspace_settings(text, text, text) TO authenticated;
