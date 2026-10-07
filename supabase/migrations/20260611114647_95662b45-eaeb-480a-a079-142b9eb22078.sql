-- Allow any authenticated user to upload/update/delete files in objekt-medien bucket.
-- Object-form access is already gated in the app; this prevents silent RLS upload failures
-- for legitimate internal users (vertriebspartner, backoffice, hausverwaltung, etc.).
DROP POLICY IF EXISTS objekt_medien_manager_write ON storage.objects;
DROP POLICY IF EXISTS objekt_medien_manager_update ON storage.objects;
DROP POLICY IF EXISTS objekt_medien_manager_delete ON storage.objects;

CREATE POLICY objekt_medien_authenticated_write
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'objekt-medien' AND auth.uid() IS NOT NULL);

CREATE POLICY objekt_medien_authenticated_update
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'objekt-medien' AND auth.uid() IS NOT NULL)
  WITH CHECK (bucket_id = 'objekt-medien' AND auth.uid() IS NOT NULL);

CREATE POLICY objekt_medien_authenticated_delete
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'objekt-medien' AND auth.uid() IS NOT NULL);