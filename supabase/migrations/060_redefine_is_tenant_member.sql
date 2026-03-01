-- #238: Nuclear fix — redefine is_tenant_member to check active tenant
-- This fixes ALL RPCs and RLS policies in one shot

CREATE OR REPLACE FUNCTION is_tenant_member(p_tenant_id uuid)
RETURNS boolean LANGUAGE sql
SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT p_tenant_id = get_my_tenant_id()
$$;

-- Also fix get_workspace_settings to use get_my_tenant_id() directly
CREATE OR REPLACE FUNCTION get_workspace_settings()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE v_result jsonb;
BEGIN
  SELECT to_jsonb(t.*) INTO v_result
  FROM tenants t
  WHERE t.id = get_my_tenant_id();
  RETURN v_result;
END; $f$;

NOTIFY pgrst, 'reload schema';
