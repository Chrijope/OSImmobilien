-- ===========================================================================
-- Verkaufsreport fuer Geschaeftspartner (Christian, 27.10.2026)
-- ===========================================================================
--
-- Ersetzt die von Hand gepflegte Excel
-- „Verkaufsreport_Eigentumswohnung_Durchschnittskaufpreis.xlsx“.
--
--   * Admin oder Inhaber erstellt im CRM einen Stand. Der Browser rechnet die
--     Zahlen aus Objekten, Einheiten und Investments (src/lib/verkaufsreport.ts)
--     und speichert sie hier als JSON, ohne Kundennamen, Bank, Berater,
--     Provision oder Einkaufspreis.
--   * Erst „Veroeffentlichen“ (veroeffentlicht_am) gibt den Stand frei.
--     Geschaeftspartner lesen nur veroeffentlichte Staende, sonst nichts.
--   * Die Rolle geschaeftspartner ist keine interne Rolle (is_internal_role),
--     sieht also weder Kunden noch Objekte, Einheiten, Profile oder Dateien.
--     Ein paar interne Tabellen stehen aber jedem Angemeldeten offen (News,
--     Team-Call, Wettbewerb, Karrierestufen, Analysetool-Ereignisse). Die
--     sperrt Abschnitt 3 fuer reine Geschaeftspartner zusaetzlich.
--
-- Mehrfach ausfuehrbar.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.verkaufsreport_staende (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stand_am date NOT NULL DEFAULT (now() AT TIME ZONE 'Europe/Berlin')::date,
  daten jsonb NOT NULL,
  erstellt_von uuid DEFAULT auth.uid(),
  erstellt_am timestamptz NOT NULL DEFAULT now(),
  veroeffentlicht_am timestamptz
);
CREATE INDEX IF NOT EXISTS verkaufsreport_staende_veroeffentlicht
  ON public.verkaufsreport_staende (veroeffentlicht_am DESC);

COMMENT ON TABLE public.verkaufsreport_staende IS
  'Staende des Verkaufsreports, ohne Personendaten. Geschaeftspartner lesen nur '
  'veroeffentlichte. Entscheidung Christian vom 27.10.2026.';


-- ---------------------------------------------------------------------------
-- 1) Wer ist reiner Geschaeftspartner?
-- ---------------------------------------------------------------------------
-- Traegt jemand zusaetzlich eine interne Rolle, gilt die interne.

CREATE OR REPLACE FUNCTION public.ist_nur_geschaeftspartner(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'geschaeftspartner'::public.app_role)
     AND NOT public.is_internal_role(_user_id)
$$;
REVOKE ALL ON FUNCTION public.ist_nur_geschaeftspartner(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.ist_nur_geschaeftspartner(uuid) TO authenticated;


-- ---------------------------------------------------------------------------
-- 2) Regeln auf den Staenden
-- ---------------------------------------------------------------------------

ALTER TABLE public.verkaufsreport_staende ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Verkaufsreport lesen" ON public.verkaufsreport_staende;
CREATE POLICY "Verkaufsreport lesen" ON public.verkaufsreport_staende
  FOR SELECT TO authenticated
  USING (
    (select public.is_admin_role(auth.uid()))
    OR (veroeffentlicht_am IS NOT NULL
        AND (select public.has_role(auth.uid(), 'geschaeftspartner'::public.app_role)))
  );

DROP POLICY IF EXISTS "Verkaufsreport anlegen" ON public.verkaufsreport_staende;
CREATE POLICY "Verkaufsreport anlegen" ON public.verkaufsreport_staende
  FOR INSERT TO authenticated
  WITH CHECK ((select public.is_admin_role(auth.uid())));

DROP POLICY IF EXISTS "Verkaufsreport veroeffentlichen" ON public.verkaufsreport_staende;
CREATE POLICY "Verkaufsreport veroeffentlichen" ON public.verkaufsreport_staende
  FOR UPDATE TO authenticated
  USING ((select public.is_admin_role(auth.uid())))
  WITH CHECK ((select public.is_admin_role(auth.uid())));

DROP POLICY IF EXISTS "Verkaufsreport loeschen" ON public.verkaufsreport_staende;
CREATE POLICY "Verkaufsreport loeschen" ON public.verkaufsreport_staende
  FOR DELETE TO authenticated
  USING ((select public.is_admin_role(auth.uid())));


-- ---------------------------------------------------------------------------
-- 3) Offene interne Tabellen fuer Geschaeftspartner sperren
-- ---------------------------------------------------------------------------
-- Diese Tabellen lesen alle Angemeldeten (USING (true)). Eine zusaetzliche,
-- einschraenkende Regel nimmt reine Geschaeftspartner heraus, ohne die
-- bestehenden Regeln anzufassen.

DO $sperren$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['news', 'team_call_protokolle', 'team_call_punkte', 'team_call_settings',
                           'wettbewerb_challenges', 'karriere_stufen', 'analysetool_ereignisse']
  LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      CONTINUE;
    END IF;
    EXECUTE format('DROP POLICY IF EXISTS "Nicht fuer Geschaeftspartner" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "Nicht fuer Geschaeftspartner" ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated '
      'USING (NOT (select public.ist_nur_geschaeftspartner(auth.uid())))', t);
  END LOOP;
END
$sperren$;
