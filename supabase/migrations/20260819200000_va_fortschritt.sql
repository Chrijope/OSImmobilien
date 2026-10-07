-- ===========================================================================
-- Vertriebsakademie: Fortschritt in der Datenbank
-- ===========================================================================
--
-- Der Fortschritt der Vertriebsakademie lag im lokalen Speicher des jeweiligen
-- Geräts. In die Datenbank gingen zwar Zusammenfassungen je Kapitel
-- (`va_partner_fortschritt`), gelesen wurde von dort aber nie: In der ganzen
-- Datei `vertriebsakademieProgress.ts` stand kein einziges SELECT.
--
-- Für den Nutzer hiess das: Am Handy gelernt, am Rechner bei null. Und weil
-- Safari den lokalen Speicher nach sieben Tagen ohne Nutzung aufräumt,
-- verschwand der Stand auch auf demselben Gerät von selbst.
--
-- Aus den bestehenden Tabellen lässt sich der Stand nicht wiederherstellen:
-- Sie speichern Summen wie "fünf Haken erledigt", nicht welche. Deshalb hält
-- diese Tabelle den vollständigen Stand als JSON, genau so, wie ihn bisher der
-- Browserspeicher hielt. Eine Zeile je Nutzer.
--
-- `va_partner_fortschritt` und die drei Detailtabellen bleiben unangetastet.
-- Sie sind für Auswertungen weiter nützlich, nur eben nicht zur
-- Wiederherstellung geeignet.

CREATE TABLE IF NOT EXISTS public.va_fortschritt (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Der vollständige Fortschrittsstand: checks, uebungen, sectionsDone,
  -- kapitelDone, answers, aufgaben, abwaegung.
  state jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.va_fortschritt IS
  'Vollständiger Lernfortschritt der Vertriebsakademie je Nutzer. Führende Quelle; der Browserspeicher ist nur Zwischenspeicher.';

ALTER TABLE public.va_fortschritt ENABLE ROW LEVEL SECURITY;

-- Jeder sieht und pflegt ausschliesslich seinen eigenen Fortschritt.
-- Bewusst ohne Admin-Ausnahme: Zum Nachsehen, wie weit jemand ist, gibt es
-- `va_partner_fortschritt`. Diese Tabelle hier ist reiner Arbeitsstand.
DROP POLICY IF EXISTS "Eigenen VA-Fortschritt lesen" ON public.va_fortschritt;
CREATE POLICY "Eigenen VA-Fortschritt lesen"
  ON public.va_fortschritt FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Eigenen VA-Fortschritt anlegen" ON public.va_fortschritt;
CREATE POLICY "Eigenen VA-Fortschritt anlegen"
  ON public.va_fortschritt FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Eigenen VA-Fortschritt aendern" ON public.va_fortschritt;
CREATE POLICY "Eigenen VA-Fortschritt aendern"
  ON public.va_fortschritt FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

REVOKE ALL ON public.va_fortschritt FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.va_fortschritt TO authenticated;

-- Zeitstempel automatisch mitführen.
CREATE OR REPLACE FUNCTION public.va_fortschritt_touch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.va_fortschritt_touch() FROM anon, authenticated;

DROP TRIGGER IF EXISTS va_fortschritt_touch_trg ON public.va_fortschritt;
CREATE TRIGGER va_fortschritt_touch_trg
  BEFORE UPDATE ON public.va_fortschritt
  FOR EACH ROW EXECUTE FUNCTION public.va_fortschritt_touch();
