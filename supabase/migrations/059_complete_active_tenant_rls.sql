-- #238: Complete RLS fix — only tables that actually exist

-- library_items: drop public read policy
DROP POLICY IF EXISTS "Public read library items" ON library_items;

-- activity_log: INSERT policy had different name
DROP POLICY IF EXISTS "Authenticated insert activity" ON activity_log;
CREATE POLICY "Active workspace insert activity" ON activity_log FOR INSERT
  WITH CHECK (is_active_tenant(tenant_id));

-- tenants: only see active tenant
DROP POLICY IF EXISTS "Members read own tenant" ON tenants;
CREATE POLICY "Members read own tenant" ON tenants FOR SELECT
  USING (is_active_tenant(id));

-- tenant_members: only see members of active workspace
DROP POLICY IF EXISTS "Members read workspace" ON tenant_members;
CREATE POLICY "Members read active workspace" ON tenant_members FOR SELECT
  USING (is_active_tenant(tenant_id));

NOTIFY pgrst, 'reload schema';
