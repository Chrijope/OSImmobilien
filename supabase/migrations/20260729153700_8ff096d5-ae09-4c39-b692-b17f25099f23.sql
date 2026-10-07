
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='aufgaben' AND policyname='Interne Rollen sehen Aufgaben am Kunden') THEN
    CREATE POLICY "Interne Rollen sehen Aufgaben am Kunden"
      ON public.aufgaben FOR SELECT TO authenticated
      USING (kontakt_id IS NOT NULL AND public.is_internal_role(auth.uid()));
  END IF;
END $$;

ALTER TABLE public.aufgaben ADD COLUMN IF NOT EXISTS ausloeser_schluessel TEXT;
ALTER TABLE public.aufgaben ADD COLUMN IF NOT EXISTS erstellt_von_name TEXT;
ALTER TABLE public.aufgaben ADD COLUMN IF NOT EXISTS investment_id UUID REFERENCES public.investments(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS aufgaben_ausloeser_offen_idx
  ON public.aufgaben (zugewiesen_an, ausloeser_schluessel)
  WHERE ausloeser_schluessel IS NOT NULL AND status <> 'erledigt';
CREATE INDEX IF NOT EXISTS aufgaben_kontakt_status_idx ON public.aufgaben (kontakt_id, status, faellig_am);
CREATE INDEX IF NOT EXISTS aufgaben_zugewiesen_status_idx ON public.aufgaben (zugewiesen_an, status, faellig_am);
CREATE INDEX IF NOT EXISTS aufgaben_investment_idx ON public.aufgaben (investment_id, status, faellig_am);

NOTIFY pgrst, 'reload schema';
