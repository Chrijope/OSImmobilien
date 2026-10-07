
DROP POLICY IF EXISTS "avatars owner insert" ON storage.objects;
DROP POLICY IF EXISTS "avatars owner update" ON storage.objects;
DROP POLICY IF EXISTS "avatars owner or admin delete" ON storage.objects;
DROP POLICY IF EXISTS "avatars public read" ON storage.objects;
DROP POLICY IF EXISTS "avatars owner select" ON storage.objects;

CREATE POLICY "avatars public read"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'avatars');

CREATE POLICY "avatars owner insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND auth.uid() IS NOT NULL
  AND name LIKE (auth.uid())::text || '/%'
);

CREATE POLICY "avatars owner update"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND auth.uid() IS NOT NULL
  AND name LIKE (auth.uid())::text || '/%'
)
WITH CHECK (
  bucket_id = 'avatars'
  AND auth.uid() IS NOT NULL
  AND name LIKE (auth.uid())::text || '/%'
);

CREATE POLICY "avatars owner or admin delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND auth.uid() IS NOT NULL
  AND (
    name LIKE (auth.uid())::text || '/%'
    OR public.is_admin_role(auth.uid())
  )
);
