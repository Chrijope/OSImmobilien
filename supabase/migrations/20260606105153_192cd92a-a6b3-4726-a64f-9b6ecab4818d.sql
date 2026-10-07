DROP POLICY IF EXISTS sca_audio_select_team ON storage.objects;

CREATE POLICY sca_audio_select_team ON storage.objects
FOR SELECT
USING (
  bucket_id = 'sales-coach-audio'
  AND (
    (auth.uid())::text = (storage.foldername(name))[1]
    OR is_admin_role(auth.uid())
    OR has_role(auth.uid(), 'vertriebsleiter'::app_role)
  )
);