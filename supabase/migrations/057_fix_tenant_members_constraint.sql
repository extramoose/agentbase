-- #237: Fix role constraints — update rows first, then set constraints

-- Update existing rows
UPDATE profiles SET role = 'owner' WHERE role = 'superadmin';
UPDATE tenant_members SET role = 'owner' WHERE role = 'superadmin';

-- Drop and recreate constraints
ALTER TABLE tenant_members DROP CONSTRAINT IF EXISTS tenant_members_role_check;
ALTER TABLE tenant_members ADD CONSTRAINT tenant_members_role_check 
  CHECK (role IN ('owner', 'admin', 'member', 'agent'));

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check 
  CHECK (role IN ('owner', 'admin', 'user'));

NOTIFY pgrst, 'reload schema';
