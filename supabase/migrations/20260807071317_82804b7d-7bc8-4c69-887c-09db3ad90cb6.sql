CREATE TABLE IF NOT EXISTS public.partner_unterlagen (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  art          text NOT NULL,
  pfad         text NOT NULL,
  dateiname    text NOT NULL,
  groesse      bigint,
  mime_typ     text,
  hochgeladen_am timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT partner_unterlagen_art_check
    CHECK (art IN ('personalausweis', 'personalausweis_rueckseite', 'gewerbeerlaubnis_34c')),
  CONSTRAINT partner_unterlagen_einmalig UNIQUE (user_id, art)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.partner_unterlagen TO authenticated;
GRANT ALL ON public.partner_unterlagen TO service_role;

CREATE INDEX IF NOT EXISTS partner_unterlagen_user_idx
  ON public.partner_unterlagen (user_id);

COMMENT ON TABLE public.partner_unterlagen IS
  'Pflichtunterlagen eines Partners aus dem Onboarding. Die Datei liegt im Bucket partner-unterlagen, hier stehen nur die Angaben dazu.';

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS gewerbeerlaubnis_34c boolean,
  ADD COLUMN IF NOT EXISTS onboarding_abgeschlossen_am timestamptz,
  ADD COLUMN IF NOT EXISTS unterlagen_frist_bis timestamptz;

COMMENT ON COLUMN public.profiles.gewerbeerlaubnis_34c IS
  'true = liegt vor, false = liegt nicht vor, NULL = noch nicht angegeben. Ein false blockiert nichts, es ist eine Information fuer die Leitung.';

UPDATE public.profiles
   SET unterlagen_frist_bis = now() + interval '30 days'
 WHERE unterlagen_frist_bis IS NULL;

ALTER TABLE public.partner_unterlagen ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Eigene Unterlagen und Leitung duerfen lesen"
  ON public.partner_unterlagen FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'inhaber')
    OR public.has_role(auth.uid(), 'backoffice')
    OR public.has_role(auth.uid(), 'vertriebsleiter')
  );

CREATE POLICY "Nur eigene Unterlagen anlegen"
  ON public.partner_unterlagen FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Nur eigene Unterlagen ersetzen"
  ON public.partner_unterlagen FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Nur die Leitung darf loeschen"
  ON public.partner_unterlagen FOR DELETE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'inhaber')
  );

CREATE POLICY "Partnerunterlagen lesen"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'partner-unterlagen'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'inhaber')
      OR public.has_role(auth.uid(), 'backoffice')
      OR public.has_role(auth.uid(), 'vertriebsleiter')
    )
  );

CREATE POLICY "Partnerunterlagen hochladen"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'partner-unterlagen'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Eigene Partnerunterlagen ersetzen"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'partner-unterlagen'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Partnerunterlagen loeschen nur Leitung"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'partner-unterlagen'
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'inhaber'))
  );