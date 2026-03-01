-- #238: Complete RLS fix — catch ALL tables missed in 058

-- library_items: drop public read policy (leaks across tenants)
DROP POLICY IF EXISTS "Public read library items" ON library_items;

-- activity_log: INSERT policy had different name
DROP POLICY IF EXISTS "Authenticated insert activity" ON activity_log;
CREATE POLICY "Active workspace insert activity" ON activity_log FOR INSERT
  WITH CHECK (is_active_tenant(tenant_id));

-- junction tables
DROP POLICY IF EXISTS "Via person tenant" ON people_companies;
CREATE POLICY "Active workspace people_companies" ON people_companies FOR ALL
  USING (EXISTS (SELECT 1 FROM people p WHERE p.id = person_id AND is_active_tenant(p.tenant_id)));

DROP POLICY IF EXISTS "Via deal tenant" ON deals_companies;
CREATE POLICY "Active workspace deals_companies" ON deals_companies FOR ALL
  USING (EXISTS (SELECT 1 FROM deals d WHERE d.id = deal_id AND is_active_tenant(d.tenant_id)));

DROP POLICY IF EXISTS "Via deal tenant" ON deals_people;
CREATE POLICY "Active workspace deals_people" ON deals_people FOR ALL
  USING (EXISTS (SELECT 1 FROM deals d WHERE d.id = deal_id AND is_active_tenant(d.tenant_id)));

-- tenants: only see active tenant
DROP POLICY IF EXISTS "Members read own tenant" ON tenants;
CREATE POLICY "Members read own tenant" ON tenants FOR SELECT
  USING (is_active_tenant(id));

-- tenant_members: only see members of active workspace
DROP POLICY IF EXISTS "Members read workspace" ON tenant_members;
CREATE POLICY "Members read active workspace" ON tenant_members FOR SELECT
  USING (is_active_tenant(tenant_id));

NOTIFY pgrst, 'reload schema';
