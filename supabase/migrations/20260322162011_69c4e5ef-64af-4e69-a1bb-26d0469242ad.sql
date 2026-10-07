-- Replace overly broad policies with role-checked ones
DROP POLICY IF EXISTS "Authenticated upload unterlagen" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated update unterlagen" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated read unterlagen" ON storage.objects;

-- Internal roles can upload/read/update any unterlagen
CREATE POLICY "Internal upload unterlagen"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'unterlagen' AND is_internal_role(auth.uid()));

CREATE POLICY "Internal read unterlagen"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'unterlagen' AND is_internal_role(auth.uid()));

CREATE POLICY "Internal update unterlagen"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'unterlagen' AND is_internal_role(auth.uid()));

-- Customers can upload to their own kontakt folder (kontakt has meta.authUserId = auth.uid())
CREATE POLICY "Kunde upload unterlagen"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'unterlagen'
  AND EXISTS (
    SELECT 1 FROM public.kontakte k
    WHERE k.id::text = (storage.foldername(name))[1]
      AND (k.meta ->> 'authUserId') = auth.uid()::text
  )
);

-- Customers can read their own unterlagen
CREATE POLICY "Kunde read unterlagen"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'unterlagen'
  AND EXISTS (
    SELECT 1 FROM public.kontakte k
    WHERE k.id::text = (storage.foldername(name))[1]
      AND (k.meta ->> 'authUserId') = auth.uid()::text
  )
);