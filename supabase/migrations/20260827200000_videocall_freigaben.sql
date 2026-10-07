-- Videocall: Freigabe fuer einzelne Nutzer neben admin/inhaber.
--
-- Der Videocall-Bereich war bis zur Erprobungsfreigabe komplett auf
-- admin/inhaber begrenzt, auch in den Datenbank-Regeln. Jetzt sollen
-- einzelne Vertriebspartner ihn nutzen (Start: zwei
-- ausgewaehlte Partner), alle anderen weiterhin nicht.
--
-- Eine Freigabetabelle statt Namen im Code: Wer darin steht, darf. Ein
-- weiterer Nutzer ist damit ein INSERT im SQL-Editor, kein Deploy.
--
-- Was die Freigabe erlaubt: eigene Videoraeume anlegen, eigene
-- Buchungskalender-Einstellungen, Zeiten, persoenliche Links und interne
-- Buchungen. Terminarten ANLEGEN und LOESCHEN bleibt bewusst admin/inhaber
-- vorbehalten (fester Satz aus vier Ereignissen), Bearbeiten der eigenen
-- Terminarten ist weiter erlaubt. Die vier Standard-Terminarten und eine
-- Einstellungszeile werden fuer Freigegebene hier gleich angelegt.

-- ---------------------------------------------------------------------------
-- 1) Freigabetabelle
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.videocall_freigaben (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  erstellt_am timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.videocall_freigaben ENABLE ROW LEVEL SECURITY;

-- Jeder sieht nur die eigene Freigabe, Admins alle. Verwalten nur Admins.
DROP POLICY IF EXISTS "Videocall-Freigabe lesen" ON public.videocall_freigaben;
CREATE POLICY "Videocall-Freigabe lesen" ON public.videocall_freigaben
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin_role(auth.uid()));

DROP POLICY IF EXISTS "Videocall-Freigabe verwalten" ON public.videocall_freigaben;
CREATE POLICY "Videocall-Freigabe verwalten" ON public.videocall_freigaben
  FOR ALL TO authenticated
  USING (public.is_admin_role(auth.uid()))
  WITH CHECK (public.is_admin_role(auth.uid()));

-- ---------------------------------------------------------------------------
-- 2) Pruef-Funktion: admin/inhaber ODER freigeschaltet
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.darf_videocall(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_admin_role(_uid)
      OR EXISTS (SELECT 1 FROM public.videocall_freigaben f WHERE f.user_id = _uid)
$$;

REVOKE ALL ON FUNCTION public.darf_videocall(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.darf_videocall(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3) Anlege-Regeln von admin auf die Freigabe umstellen
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Videoraum anlegen" ON public.videoraeume;
CREATE POLICY "Videoraum anlegen" ON public.videoraeume
  FOR INSERT TO authenticated
  WITH CHECK (gastgeber_id = auth.uid() AND public.darf_videocall(auth.uid()));

DROP POLICY IF EXISTS "Buchung Einstellungen anlegen" ON public.buchung_einstellungen;
CREATE POLICY "Buchung Einstellungen anlegen" ON public.buchung_einstellungen
  FOR INSERT TO authenticated
  WITH CHECK (mitarbeiter_id = auth.uid() AND public.darf_videocall(auth.uid()));

DROP POLICY IF EXISTS "Buchung Verfuegbarkeit anlegen" ON public.buchung_verfuegbarkeiten;
CREATE POLICY "Buchung Verfuegbarkeit anlegen" ON public.buchung_verfuegbarkeiten
  FOR INSERT TO authenticated
  WITH CHECK (mitarbeiter_id = auth.uid() AND public.darf_videocall(auth.uid()));

DROP POLICY IF EXISTS "Buchung Links anlegen" ON public.buchung_links;
CREATE POLICY "Buchung Links anlegen" ON public.buchung_links
  FOR INSERT TO authenticated
  WITH CHECK (mitarbeiter_id = auth.uid() AND public.darf_videocall(auth.uid()));

DROP POLICY IF EXISTS "Buchungen anlegen" ON public.buchungen;
CREATE POLICY "Buchungen anlegen" ON public.buchungen
  FOR INSERT TO authenticated
  WITH CHECK (mitarbeiter_id = auth.uid() AND public.darf_videocall(auth.uid()));

-- Terminarten anlegen bleibt bewusst admin-only (fester Ereignis-Satz).
-- Auch das Loeschen wird jetzt hart auf admin begrenzt, bisher konnte der
-- Eigentuemer per Schnittstelle loeschen (siehe offener Punkt vom 27.08.).
DROP POLICY IF EXISTS "Buchung Terminarten loeschen" ON public.buchung_terminarten;
CREATE POLICY "Buchung Terminarten loeschen" ON public.buchung_terminarten
  FOR DELETE TO authenticated
  USING (public.is_admin_role(auth.uid()));

-- ---------------------------------------------------------------------------
-- 4) Freigaben fuer einzelne Personen
-- ---------------------------------------------------------------------------

-- Datenanweisung des Ursprungsprojekts entfernt (OSImmobilien)

-- ---------------------------------------------------------------------------
-- 5) Grundausstattung fuer alle Freigegebenen: Einstellungszeile und die
--    vier Standard-Terminarten, idempotent wie in 20260827130000.
-- ---------------------------------------------------------------------------

INSERT INTO public.buchung_einstellungen (mitarbeiter_id, slug, offen_aktiv, zeitzone)
SELECT f.user_id, NULL, false, 'Europe/Berlin'
FROM public.videocall_freigaben f
WHERE NOT EXISTS (
  SELECT 1 FROM public.buchung_einstellungen e WHERE e.mitarbeiter_id = f.user_id
);

INSERT INTO public.buchung_terminarten
  (mitarbeiter_id, bezeichnung, beschreibung, dauer_minuten,
   puffer_vor_minuten, puffer_nach_minuten, vorlauf_minuten,
   vorausschau_tage, raster_minuten, aktiv, oeffentlich, anlass, sortierung)
SELECT
  f.user_id, v.bezeichnung, v.beschreibung, 60, 0, 15, 240, 60, 15, true, false, v.anlass, v.sortierung
FROM public.videocall_freigaben f
CROSS JOIN (VALUES
  ('Telefonisches Erstgespräch',
   'Wir lernen uns in 15 bis 30 Minuten kennen und schauen, wie wir Sie bei Ihrem Immobilieninvestment bestmöglich begleiten können.',
   'erstgespraech', 1),
  ('Beratungsgespräch',
   'Wir stellen uns Ihnen im Detail vor und klären ausführlich, was in Ihrer Situation möglich ist.',
   'beratung', 2),
  ('Objektvorstellung',
   'Wir stellen dir deine passende Immobilie im Detail vor: Lage, Objekt, Zahlen und Unterlagen. Am Ende weißt du genau, was du kaufst und wie es weitergeht.',
   'objektvorstellung', 3),
  ('Finanzierungsgespräch',
   'Wir besprechen deine Finanzierung: den Rahmen, die Konditionen und die Unterlagen für die Bank. Danach stehen die nächsten Schritte bis zur Zusage fest.',
   'finanzierungsgespraech', 4)
) AS v(bezeichnung, beschreibung, anlass, sortierung)
WHERE NOT EXISTS (
  SELECT 1 FROM public.buchung_terminarten t
  WHERE t.mitarbeiter_id = f.user_id AND lower(t.bezeichnung) = lower(v.bezeichnung)
);
