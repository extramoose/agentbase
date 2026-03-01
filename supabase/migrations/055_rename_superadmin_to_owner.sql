-- #222: Rename 'superadmin' role to 'owner' everywhere
-- Run this in Supabase SQL editor

BEGIN;

-- 1. Drop check constraints FIRST
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE tenant_members DROP CONSTRAINT IF EXISTS tenant_members_role_check;

-- 2. Update existing rows
UPDATE profiles SET role = 'owner' WHERE role = 'superadmin';
UPDATE tenant_members SET role = 'owner' WHERE role = 'superadmin';

-- 3. Recreate check constraints with new values
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('owner', 'admin', 'user'));
ALTER TABLE tenant_members ADD CONSTRAINT tenant_members_role_check CHECK (role IN ('owner', 'admin', 'member', 'agent'));

-- 4. Update RLS policies that reference 'superadmin'
DROP POLICY IF EXISTS "Admins manage profiles" ON profiles;
CREATE POLICY "Admins manage profiles" ON profiles FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','owner')));

DROP POLICY IF EXISTS "Superadmins manage members" ON tenant_members;
DROP POLICY IF EXISTS "Owners manage members" ON tenant_members;
CREATE POLICY "Owners manage members" ON tenant_members FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM tenant_members tm
    WHERE tm.tenant_id = tenant_members.tenant_id AND tm.user_id = auth.uid() AND tm.role = 'owner'
  ));
DROP POLICY IF EXISTS "Owners update members" ON tenant_members;
CREATE POLICY "Owners update members" ON tenant_members FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM tenant_members tm
    WHERE tm.tenant_id = tenant_members.tenant_id AND tm.user_id = auth.uid() AND tm.role = 'owner'
  ));

NOTIFY pgrst, 'reload schema';

COMMIT;
