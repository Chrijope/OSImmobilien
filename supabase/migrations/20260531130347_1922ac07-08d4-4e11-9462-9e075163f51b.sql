DROP POLICY IF EXISTS "Authenticated list avatars" ON storage.objects;

CREATE POLICY "Admins list avatars"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'avatars'
  AND public.is_admin_role(auth.uid())
);