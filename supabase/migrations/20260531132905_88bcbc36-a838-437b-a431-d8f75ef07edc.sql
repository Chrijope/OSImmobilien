
CREATE TABLE public.sales_coach_aufnahmen (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  kontakt_id UUID NOT NULL,
  investment_id UUID,
  titel TEXT NOT NULL DEFAULT 'Aufnahme',
  typ TEXT NOT NULL CHECK (typ IN ('erstgespraech', 'beratung', 'objektvorstellung', 'reservierung')),
  audio_path TEXT,
  audio_duration_sec INTEGER,
  audio_mime TEXT DEFAULT 'audio/webm',
  audio_groesse_bytes BIGINT,
  status TEXT NOT NULL DEFAULT 'uploading' CHECK (status IN ('uploading', 'transcribing', 'completed', 'failed')),
  transkript TEXT,
  ki_analyse JSONB,
  fehler_meldung TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  erstellt_am TIMESTAMPTZ NOT NULL DEFAULT now(),
  transkribiert_am TIMESTAMPTZ,
  audio_loeschen_nach TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '90 days')
);

CREATE INDEX idx_sca_user_id ON public.sales_coach_aufnahmen(user_id);
CREATE INDEX idx_sca_kontakt_id ON public.sales_coach_aufnahmen(kontakt_id);
CREATE INDEX idx_sca_investment_id ON public.sales_coach_aufnahmen(investment_id);
CREATE INDEX idx_sca_erstellt_am ON public.sales_coach_aufnahmen(erstellt_am DESC);
CREATE INDEX idx_sca_audio_loeschen ON public.sales_coach_aufnahmen(audio_loeschen_nach) WHERE audio_path IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_coach_aufnahmen TO authenticated;
GRANT ALL ON public.sales_coach_aufnahmen TO service_role;

ALTER TABLE public.sales_coach_aufnahmen ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sca_select_own_or_admin"
ON public.sales_coach_aufnahmen FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_admin_role(auth.uid())
  OR public.has_role(auth.uid(), 'vertriebsleiter'::app_role)
);

CREATE POLICY "sca_insert_own"
ON public.sales_coach_aufnahmen FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "sca_update_own_or_admin"
ON public.sales_coach_aufnahmen FOR UPDATE TO authenticated
USING (user_id = auth.uid() OR public.is_admin_role(auth.uid()))
WITH CHECK (user_id = auth.uid() OR public.is_admin_role(auth.uid()));

CREATE POLICY "sca_delete_own_or_admin"
ON public.sales_coach_aufnahmen FOR DELETE TO authenticated
USING (user_id = auth.uid() OR public.is_admin_role(auth.uid()));

INSERT INTO storage.buckets (id, name, public)
VALUES ('sales-coach-audio', 'sales-coach-audio', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "sca_audio_select"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'sales-coach-audio'
  AND (
    auth.uid()::text = (storage.foldername(name))[1]
    OR public.is_admin_role(auth.uid())
    OR public.has_role(auth.uid(), 'vertriebsleiter'::app_role)
  )
);

CREATE POLICY "sca_audio_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'sales-coach-audio'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "sca_audio_delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'sales-coach-audio'
  AND (
    auth.uid()::text = (storage.foldername(name))[1]
    OR public.is_admin_role(auth.uid())
  )
);
