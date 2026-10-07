DROP POLICY IF EXISTS "Internal roles can upload bewerbung paket pdfs" ON storage.objects;

CREATE POLICY "Internal roles can upload bewerbung paket pdfs"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'bewerbungen'
  AND (storage.foldername(name))[1] IN ('paket-uebersicht', 'muster-vertrag')
  AND public.is_internal_role(auth.uid())
);