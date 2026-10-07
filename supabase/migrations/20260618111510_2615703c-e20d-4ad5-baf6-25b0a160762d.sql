DROP POLICY IF EXISTS objekt_medien_authenticated_write ON storage.objects;
DROP POLICY IF EXISTS objekt_medien_authenticated_update ON storage.objects;
DROP POLICY IF EXISTS objekt_medien_authenticated_delete ON storage.objects;

CREATE POLICY objekt_medien_internal_write ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'objekt-medien' AND public.is_internal_role(auth.uid()));

CREATE POLICY objekt_medien_internal_update ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'objekt-medien' AND public.is_internal_role(auth.uid()))
WITH CHECK (bucket_id = 'objekt-medien' AND public.is_internal_role(auth.uid()));

CREATE POLICY objekt_medien_internal_delete ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'objekt-medien' AND public.is_internal_role(auth.uid()));