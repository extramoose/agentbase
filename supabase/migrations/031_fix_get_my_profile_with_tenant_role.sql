-- Fix: getUserProfile() queries tenant_members directly via Supabase client,
-- which is subject to RLS. The RLS policy on tenant_members has a circular
-- reference that can fail for new users. Replace with a SECURITY DEFINER
-- function that returns the profile with tenant_role included.

CREATE OR REPLACE FUNCTION get_my_profile_with_role()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE AS $$
DECLARE
  v_user_id uuid;
  v_profile jsonb;
  v_tenant_role text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RETURN NULL; END IF;

  SELECT to_jsonb(p.*) INTO v_profile FROM profiles p WHERE p.id = v_user_id;
  IF v_profile IS NULL THEN RETURN NULL; END IF;

  SELECT tm.role INTO v_tenant_role
  FROM tenant_members tm
  WHERE tm.user_id = v_user_id
    AND tm.tenant_id = (v_profile->>'active_tenant_id')::uuid;

  RETURN v_profile || jsonb_build_object('tenant_role', v_tenant_role);
END;
$$;

GRANT EXECUTE ON FUNCTION get_my_profile_with_role() TO authenticated;
