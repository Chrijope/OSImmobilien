-- Mitschriften der Videogespraeche.
--
-- Es wird ausschliesslich Text gespeichert, niemals Ton. Die Erkennung laeuft
-- im Browser des Beraters, der Ton verlaesst sein Geraet nicht und existiert
-- nur im Arbeitsspeicher. Deshalb gibt es hier auch keine Spalte und keinen
-- Storage-Bereich fuer eine Aufnahme, und es soll auch keine geben.
--
-- Warum eine eigene Tabelle und nicht das Feld `aktivitaeten.details`: Eine
-- Mitschrift von 45 Minuten sind einige zehntausend Zeichen samt Zeitstempeln
-- je Wortmeldung. Das gehoert nicht in ein Notizfeld, das ueberall im CRM
-- ungefiltert angezeigt wird. In der Kundenakte steht deshalb nur eine
-- Aktivitaet der Art `meeting_protokoll` mit der Kurzfassung, der volle Text
-- liegt hier und wird nur beim Aufklappen geholt.
--
-- Zugriff wie bei `videoraeume`: der Gastgeber des Gespraechs oder
-- `is_admin_role`. Der Gast hat kein Konto und bekommt hier nichts, weder
-- lesend noch schreibend. `anon` wird ausdruecklich ausgeschlossen, es gibt
-- keine RPC auf diese Tabelle.

CREATE TABLE IF NOT EXISTS public.gespraech_mitschriften (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Der Raum kann spaeter aufgeraeumt werden, die Mitschrift bleibt an der
  -- Kundenakte haengen. Deshalb SET NULL und nicht CASCADE.
  raum_id uuid REFERENCES public.videoraeume(id) ON DELETE SET NULL,
  kontakt_id uuid,
  investment_id uuid,
  -- Die Aktivitaet in der Kundenakte, die auf diese Mitschrift zeigt.
  aktivitaet_id uuid,
  gastgeber_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  begonnen_at timestamptz,
  beendet_at timestamptz,
  dauer_sekunden integer NOT NULL DEFAULT 0,
  -- Die Wortmeldungen: [{ "zeitpunkt": 12.4, "sprecher": "Kunde", "text": "…" }]
  zeilen jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Dieselben Zeilen als schlichter Text, fuer Suche und Anzeige.
  volltext text NOT NULL DEFAULT '',
  -- Kurzfassung ohne Sprachmodell, siehe src/lib/mitschriftZusammenfassung.ts
  zusammenfassung text NOT NULL DEFAULT '',
  -- Welches Modell erkannt hat, damit spaeter nachvollziehbar bleibt, wie
  -- zuverlaessig eine alte Mitschrift ist.
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

-- ---------------------------------------------------------------------------
-- Zugriffskontrolle
-- ---------------------------------------------------------------------------

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

-- Der Gast im Videoraum ist `anon`. Er darf diese Tabelle nie sehen.
REVOKE ALL ON public.gespraech_mitschriften FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gespraech_mitschriften TO authenticated;
