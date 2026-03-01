-- #238: Complete RLS fix — catch ALL tables missed in 058

-- library_items: also drop the public read policy (leaks across tenants)
DROP POLICY IF EXISTS "Public read library items" ON library_items;

-- activity_log: the INSERT policy had a different name
DROP POLICY IF EXISTS "Authenticated insert activity" ON activity_log;
CREATE POLICY "Active workspace insert activity" ON activity_log FOR INSERT
  WITH CHECK (is_active_tenant(tenant_id));

-- meetings
DROP POLICY IF EXISTS "Workspace members CRUD meetings" ON meetings;
CREATE POLICY "Active workspace CRUD meetings" ON meetings FOR ALL
  USING (is_active_tenant(tenant_id)) WITH CHECK (is_active_tenant(tenant_id));

-- diary_entries
DROP POLICY IF EXISTS "Workspace members CRUD diary" ON diary_entries;
CREATE POLICY "Active workspace CRUD diary" ON diary_entries FOR ALL
  USING (is_active_tenant(tenant_id)) WITH CHECK (is_active_tenant(tenant_id));

-- grocery_items
DROP POLICY IF EXISTS "Workspace members CRUD grocery" ON grocery_items;
CREATE POLICY "Active workspace CRUD grocery" ON grocery_items FOR ALL
  USING (is_active_tenant(tenant_id)) WITH CHECK (is_active_tenant(tenant_id));

-- junction tables (scope via parent tenant)
DROP POLICY IF EXISTS "Via meeting tenant" ON meetings_people;
CREATE POLICY "Active workspace meetings_people" ON meetings_people FOR ALL
  USING (EXISTS (SELECT 1 FROM meetings m WHERE m.id = meeting_id AND is_active_tenant(m.tenant_id)));

DROP POLICY IF EXISTS "Via meeting tenant" ON meetings_companies;
CREATE POLICY "Active workspace meetings_companies" ON meetings_companies FOR ALL
  USING (EXISTS (SELECT 1 FROM meetings m WHERE m.id = meeting_id AND is_active_tenant(m.tenant_id)));

DROP POLICY IF EXISTS "Via person tenant" ON people_companies;
CREATE POLICY "Active workspace people_companies" ON people_companies FOR ALL
  USING (EXISTS (SELECT 1 FROM people p WHERE p.id = person_id AND is_active_tenant(p.tenant_id)));

DROP POLICY IF EXISTS "Via deal tenant" ON deals_companies;
CREATE POLICY "Active workspace deals_companies" ON deals_companies FOR ALL
  USING (EXISTS (SELECT 1 FROM deals d WHERE d.id = deal_id AND is_active_tenant(d.tenant_id)));

DROP POLICY IF EXISTS "Via deal tenant" ON deals_people;
CREATE POLICY "Active workspace deals_people" ON deals_people FOR ALL
  USING (EXISTS (SELECT 1 FROM deals d WHERE d.id = deal_id AND is_active_tenant(d.tenant_id)));

-- tenants: only see your active tenant
DROP POLICY IF EXISTS "Members read own tenant" ON tenants;
CREATE POLICY "Members read own tenant" ON tenants FOR SELECT
  USING (is_active_tenant(id));

-- tenant_members: only see members of active workspace
DROP POLICY IF EXISTS "Members read workspace" ON tenant_members;
CREATE POLICY "Members read active workspace" ON tenant_members FOR SELECT
  USING (is_active_tenant(tenant_id));

NOTIFY pgrst, 'reload schema';
