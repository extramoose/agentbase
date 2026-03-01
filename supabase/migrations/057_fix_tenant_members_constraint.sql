-- #237: Fix tenant_members role check constraint
-- Ensures 'owner' is allowed (may have been missed if 055 partially failed)

ALTER TABLE tenant_members DROP CONSTRAINT IF EXISTS tenant_members_role_check;
ALTER TABLE tenant_members ADD CONSTRAINT tenant_members_role_check 
  CHECK (role IN ('owner', 'admin', 'member', 'agent'));

-- Also fix profiles just in case
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check 
  CHECK (role IN ('owner', 'admin', 'user'));

NOTIFY pgrst, 'reload schema';
