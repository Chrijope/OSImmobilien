DROP POLICY IF EXISTS "sca_select_own_or_admin" ON public.sales_coach_aufnahmen;
CREATE POLICY "sca_select_team"
ON public.sales_coach_aufnahmen FOR SELECT TO authenticated
USING (
  NOT public.has_role(auth.uid(), 'kunde'::app_role)
);

DROP POLICY IF EXISTS "sca_audio_select" ON storage.objects;
CREATE POLICY "sca_audio_select_team"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'sales-coach-audio'
  AND NOT public.has_role(auth.uid(), 'kunde'::app_role)
);