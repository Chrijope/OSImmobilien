
-- Schritt 2: selbstauskunft-pdfs Read verschärfen
DROP POLICY IF EXISTS "SA-PDFs: authenticated read" ON storage.objects;

CREATE POLICY "SA-PDFs: internal or owner read"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'selbstauskunft-pdfs'
  AND (
    public.is_internal_role(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.kontakte k
      WHERE k.id::text = (storage.foldername(storage.objects.name))[1]
        AND (
          (k.meta ->> 'authUserId') = auth.uid()::text
          OR ((k.meta -> 'person2') ->> 'authUserId') = auth.uid()::text
        )
    )
  )
);

-- Schritt 3: bewerbungen Read/Delete auf internal_role einschränken
DROP POLICY IF EXISTS "Authenticated users can read application documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete application documents" ON storage.objects;

CREATE POLICY "Bewerbungen: internal read"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'bewerbungen'
  AND public.is_internal_role(auth.uid())
);

CREATE POLICY "Bewerbungen: internal delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'bewerbungen'
  AND public.is_internal_role(auth.uid())
);
