DROP POLICY IF EXISTS "Internal upload Ansprechpartner-Bilder" ON storage.objects;
DROP POLICY IF EXISTS "Internal update Ansprechpartner-Bilder" ON storage.objects;
DROP POLICY IF EXISTS "Internal delete Ansprechpartner-Bilder" ON storage.objects;

CREATE POLICY "Auth upload Ansprechpartner-Bilder"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'ansprechpartner');

CREATE POLICY "Auth update Ansprechpartner-Bilder"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'ansprechpartner')
WITH CHECK (bucket_id = 'ansprechpartner');

CREATE POLICY "Auth delete Ansprechpartner-Bilder"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'ansprechpartner');