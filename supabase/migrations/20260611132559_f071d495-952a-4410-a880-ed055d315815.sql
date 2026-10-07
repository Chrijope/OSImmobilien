DROP POLICY IF EXISTS objekt_medien_authenticated_read ON storage.objects;
CREATE POLICY objekt_medien_authenticated_read
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'objekt-medien');