CREATE TABLE IF NOT EXISTS public.gespraech_mitschriften (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  raum_id uuid REFERENCES public.videoraeume(id) ON DELETE SET NULL,
  kontakt_id uuid,
  investment_id uuid,
  aktivitaet_id uuid,
  gastgeber_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  begonnen_at timestamptz,
  beendet_at timestamptz,
  dauer_sekunden integer NOT NULL DEFAULT 0,
  zeilen jsonb NOT NULL DEFAULT '[]'::jsonb,
  volltext text NOT NULL DEFAULT '',
  zusammenfassung text NOT NULL DEFAULT '',
  modell text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gespraech_mitschriften_kontakt_idx
  ON public.gespraech_mitschriften (kontakt_id, beendet_at DESC);
CREATE INDEX IF NOT EXISTS gespraech_mitschriften_gastgeber_idx
  ON public.gespraech_mitschriften (gastgeber_id, created_at DESC);
CREATE INDEX IF NOT EXISTS gespraech_mitschriften_raum_idx
  ON public.gespraech_mitschriften (raum_id);

DROP TRIGGER IF EXISTS gespraech_mitschriften_set_updated_at ON public.gespraech_mitschriften;
CREATE TRIGGER gespraech_mitschriften_set_updated_at
  BEFORE UPDATE ON public.gespraech_mitschriften
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.gespraech_mitschriften ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Mitschrift lesen" ON public.gespraech_mitschriften;
CREATE POLICY "Mitschrift lesen" ON public.gespraech_mitschriften
  FOR SELECT TO authenticated
  USING (gastgeber_id = auth.uid() OR public.is_admin_role(auth.uid()));

DROP POLICY IF EXISTS "Mitschrift anlegen" ON public.gespraech_mitschriften;
CREATE POLICY "Mitschrift anlegen" ON public.gespraech_mitschriften
  FOR INSERT TO authenticated
  WITH CHECK (gastgeber_id = auth.uid());

DROP POLICY IF EXISTS "Mitschrift aendern" ON public.gespraech_mitschriften;
CREATE POLICY "Mitschrift aendern" ON public.gespraech_mitschriften
  FOR UPDATE TO authenticated
  USING (gastgeber_id = auth.uid() OR public.is_admin_role(auth.uid()))
  WITH CHECK (gastgeber_id = auth.uid() OR public.is_admin_role(auth.uid()));

DROP POLICY IF EXISTS "Mitschrift loeschen" ON public.gespraech_mitschriften;
CREATE POLICY "Mitschrift loeschen" ON public.gespraech_mitschriften
  FOR DELETE TO authenticated
  USING (gastgeber_id = auth.uid() OR public.is_admin_role(auth.uid()));

REVOKE ALL ON public.gespraech_mitschriften FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gespraech_mitschriften TO authenticated;
GRANT ALL ON public.gespraech_mitschriften TO service_role;