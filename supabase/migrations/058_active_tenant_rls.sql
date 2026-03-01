-- #238: Scope RLS to active tenant only (not all memberships)
-- This ensures workspace switching properly isolates data

-- New function: checks if tenant_id matches the user's active workspace
CREATE OR REPLACE FUNCTION is_active_tenant(p_tenant_id uuid)
RETURNS boolean LANGUAGE sql
SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT p_tenant_id = get_my_tenant_id()
$$;

-- Replace all entity table RLS policies to use is_active_tenant instead of is_tenant_member
-- This scopes queries to the active workspace only

-- tasks
DROP POLICY IF EXISTS "Workspace members CRUD tasks" ON tasks;
CREATE POLICY "Active workspace CRUD tasks" ON tasks FOR ALL
  USING (is_active_tenant(tenant_id)) WITH CHECK (is_active_tenant(tenant_id));

-- library_items
DROP POLICY IF EXISTS "Workspace members CRUD library" ON library_items;
CREATE POLICY "Active workspace CRUD library" ON library_items FOR ALL
  USING (is_active_tenant(tenant_id)) WITH CHECK (is_active_tenant(tenant_id));

-- companies
DROP POLICY IF EXISTS "Workspace members CRUD companies" ON companies;
CREATE POLICY "Active workspace CRUD companies" ON companies FOR ALL
  USING (is_active_tenant(tenant_id)) WITH CHECK (is_active_tenant(tenant_id));

-- people
DROP POLICY IF EXISTS "Workspace members CRUD people" ON people;
CREATE POLICY "Active workspace CRUD people" ON people FOR ALL
  USING (is_active_tenant(tenant_id)) WITH CHECK (is_active_tenant(tenant_id));

-- deals
DROP POLICY IF EXISTS "Workspace members CRUD deals" ON deals;
CREATE POLICY "Active workspace CRUD deals" ON deals FOR ALL
  USING (is_active_tenant(tenant_id)) WITH CHECK (is_active_tenant(tenant_id));

-- activity_log
DROP POLICY IF EXISTS "Workspace members read activity" ON activity_log;
CREATE POLICY "Active workspace read activity" ON activity_log FOR SELECT
  USING (is_active_tenant(tenant_id));
DROP POLICY IF EXISTS "Workspace members write activity" ON activity_log;
CREATE POLICY "Active workspace write activity" ON activity_log FOR INSERT
  WITH CHECK (is_active_tenant(tenant_id));

-- tags
DROP POLICY IF EXISTS "Workspace members CRUD tags" ON tags;
CREATE POLICY "Active workspace CRUD tags" ON tags FOR ALL
  USING (is_active_tenant(tenant_id)) WITH CHECK (is_active_tenant(tenant_id));

-- tenant_members: keep is_tenant_member here (need to see members of active workspace)
-- No change needed — already scoped correctly

-- Also force a hard navigation on workspace switch instead of router.refresh()
-- (handled in code, not SQL)

NOTIFY pgrst, 'reload schema';
