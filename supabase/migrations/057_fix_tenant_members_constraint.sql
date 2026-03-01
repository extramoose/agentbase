-- #237: Fix role constraints
-- Drop ALL constraints first, then update rows, then recreate

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE tenant_members DROP CONSTRAINT IF EXISTS tenant_members_role_check;

UPDATE profiles SET role = 'owner' WHERE role = 'superadmin';
UPDATE tenant_members SET role = 'owner' WHERE role = 'superadmin';

ALTER TABLE profiles ADD CONSTRAINT profiles_role_check 
  CHECK (role IN ('owner', 'admin', 'user'));
ALTER TABLE tenant_members ADD CONSTRAINT tenant_members_role_check 
  CHECK (role IN ('owner', 'admin', 'member', 'agent'));

NOTIFY pgrst, 'reload schema';
