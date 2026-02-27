-- 026_avatar_storage.sql
-- Supabase Storage bucket for user + agent avatars

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  5242880, -- 5 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- Anyone can read avatars (public bucket, but explicit policy for clarity)
CREATE POLICY "Public avatar read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

-- Authenticated users can upload to their own user folder (users/{user_id}/*)
CREATE POLICY "Users can upload own avatar"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.uid() IS NOT NULL
    AND (
      -- user avatar path: users/{user_id}/avatar.*
      (storage.foldername(name))[1] = 'users'
      AND (storage.foldername(name))[2] = auth.uid()::text
    )
  );

CREATE POLICY "Users can update own avatar"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = 'users'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

CREATE POLICY "Users can delete own avatar"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = 'users'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

-- Admins can upload agent avatars (agents/{agent_id}/*)
CREATE POLICY "Admins can manage agent avatars"
  ON storage.objects FOR ALL
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = 'agents'
    AND is_admin()
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = 'agents'
    AND is_admin()
  );
