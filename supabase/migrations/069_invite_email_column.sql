-- Add email column to workspace_invites for tracking who was invited
ALTER TABLE workspace_invites ADD COLUMN IF NOT EXISTS email text;

NOTIFY pgrst, 'reload schema';
