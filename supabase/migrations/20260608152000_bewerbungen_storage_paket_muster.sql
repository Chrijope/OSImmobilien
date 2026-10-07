-- Erlaubt Uploads in die neuen Bewerbungs-Unterordner (paket-uebersicht/, muster-vertrag/)
CREATE POLICY "Internal roles can upload bewerbung paket pdfs"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'bewerbungen'
  AND (storage.foldername(name))[1] IN ('paket-uebersicht', 'muster-vertrag')
  AND (
    is_admin_role(auth.uid())
    OR has_role(auth.uid(), 'hr'::app_role)
    OR has_role(auth.uid(), 'backoffice'::app_role)
  )
);
