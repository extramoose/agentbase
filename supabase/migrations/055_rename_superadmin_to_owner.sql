-- #222: Rename 'superadmin' role to 'owner' everywhere
-- Run this in Supabase SQL editor

BEGIN;

-- 1. Update existing rows
UPDATE profiles SET role = 'owner' WHERE role = 'superadmin';
UPDATE tenant_members SET role = 'owner' WHERE role = 'superadmin';

-- 2. Drop and recreate check constraints on profiles.role
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('owner', 'admin', 'user'));

-- 3. Drop and recreate check constraints on tenant_members.role
ALTER TABLE tenant_members DROP CONSTRAINT IF EXISTS tenant_members_role_check;
ALTER TABLE tenant_members ADD CONSTRAINT tenant_members_role_check CHECK (role IN ('owner', 'admin', 'member', 'agent'));

-- 4. Update RLS policies that reference 'superadmin'

-- profiles: admin access policy
DROP POLICY IF EXISTS "Admins manage profiles" ON profiles;
CREATE POLICY "Admins manage profiles" ON profiles FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','owner')));

-- tenant_members: owner manage policies
DROP POLICY IF EXISTS "Superadmins manage members" ON tenant_members;
DROP POLICY IF EXISTS "Owners manage members" ON tenant_members;
CREATE POLICY "Owners manage members" ON tenant_members FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM tenant_members tm
    WHERE tm.tenant_id = tenant_members.tenant_id AND tm.user_id = auth.uid() AND tm.role = 'owner'
  ));
CREATE POLICY "Owners update members" ON tenant_members FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM tenant_members tm
    WHERE tm.tenant_id = tenant_members.tenant_id AND tm.user_id = auth.uid() AND tm.role = 'owner'
  ));

-- agent_owners: owner policy
DROP POLICY IF EXISTS "Superadmins manage agents" ON agent_owners;
DROP POLICY IF EXISTS "Owners manage agents" ON agent_owners;
CREATE POLICY "Owners manage agents" ON agent_owners FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'owner'));

-- 5. Update get_my_profile_with_role RPC if it references superadmin
-- (It returns the role value directly, so updating rows is sufficient)

NOTIFY pgrst, 'reload schema';

COMMIT;
