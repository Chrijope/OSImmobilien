
DROP POLICY IF EXISTS "Auth loeschen Ansprechpartner-Bilder" ON storage.objects;
DROP POLICY IF EXISTS "Auth laden Ansprechpartner-Bilder hoch" ON storage.objects;
DROP POLICY IF EXISTS "Auth aktualisieren Ansprechpartner-Bilder" ON storage.objects;

CREATE POLICY "Internal upload Ansprechpartner-Bilder"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'ansprechpartner' AND public.is_internal_role(auth.uid()));

CREATE POLICY "Internal update Ansprechpartner-Bilder"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'ansprechpartner' AND public.is_internal_role(auth.uid()));

CREATE POLICY "Internal delete Ansprechpartner-Bilder"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'ansprechpartner' AND public.is_internal_role(auth.uid()));
