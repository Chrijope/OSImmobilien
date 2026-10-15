-- ===========================================================================
-- Provision ohne Karrierestufe: nur noch der feste Satz je Partner
-- ===========================================================================
--
-- CHRISTIANS ENTSCHEIDUNG (15.10.2026)
--
--   Bei OS Immobilien gibt es keine Karrierestufen und keine Staffel. Jeder
--   Vertriebspartner hat einen festen Satz aus der Nutzerverwaltung,
--   getrennt nach Lead (zugewiesen) und Eigen. Ab der Reservierung gilt der
--   am Investment festgeschriebene Satz (Entscheidung vom 29.09.2026).
--
-- WAS DIESE MIGRATION TUT
--
--   1. Sicherung: Wer heute keinen eigenen Satz hat und deshalb ueber die
--      Karrierestufe (oder die erste Stufe, 3 %) bezahlt wird, kommt mit
--      seinen bisherigen Einstellungen in die Tabelle
--      user_settings_sicherung_20261015.
--   2. Genau diesen Satz als custom_provision_rate eintragen. Damit rechnet
--      fuer diese Partner nach der Migration alles wie vorher; der Satz
--      steht jetzt nur sichtbar in der Nutzerverwaltung.
--      Betroffen: Vertriebspartner und Vertriebsleiter (die Rollen, die die
--      Abrechnung fuehrt) sowie jeder mit einem karriere_override.
--   3. provisionssatz_fuer_partner ohne Stufen-Rueckfall. Ohne Satz liefert
--      sie NULL; der Trigger vermerkt dann am Investment
--      'kein_satz_ermittelbar', statt still einen Stufensatz festzuschreiben.
--
-- WAS SICH NICHT AENDERT
--
--   - Kein festgeschriebener Satz an einem Investment (lockedProvisionRate*).
--   - Kein Bescheid in provisionsabrechnungen.
--   - Gepflegte Saetze (custom_provision_rate, _setter, _eigen) bleiben.
--   - karriere_override und die Tabelle karriere_stufen bleiben stehen,
--     werden aber fuer den Satz nicht mehr gelesen.
--
-- Zuruecksetzen bei Bedarf (stellt die Einstellungen der gesicherten
-- Partner wieder her; Zeilen, die erst hier angelegt wurden, haben
-- war_vorhanden = false und koennen geloescht werden):
--   UPDATE public.user_settings u SET einstellungen = s.einstellungen
--     FROM public.user_settings_sicherung_20261015 s
--    WHERE s.user_id = u.user_id AND s.war_vorhanden;
--
-- Mehrfach ausfuehrbar: Ein zweiter Lauf findet niemanden ohne Satz mehr.
-- Voraussetzungen: 20260818140000 (einstellung_zahl, karriere_stufe_rate,
-- karriere_stufen) und 20260929140000 (Trigger ab Reservierung).
-- ===========================================================================

BEGIN;

DO $$
BEGIN
  IF to_regprocedure('public.einstellung_zahl(jsonb,text)') IS NULL
     OR to_regprocedure('public.karriere_stufe_rate(text)') IS NULL
     OR to_regclass('public.karriere_stufen') IS NULL
     OR to_regprocedure('public.provisionssatz_ermitteln(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Voraussetzung fehlt. Zuerst 20260818140000 und 20260929140000 ausfuehren.';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 1) Betroffene Partner und Sicherung
-- ---------------------------------------------------------------------------

-- RLS an und keine Policy: ueber die API nicht lesbar.
CREATE TABLE IF NOT EXISTS public.user_settings_sicherung_20261015 (
  user_id uuid PRIMARY KEY,
  einstellungen jsonb,
  war_vorhanden boolean NOT NULL,
  gesicherter_satz numeric NOT NULL,
  gesichert_am timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_settings_sicherung_20261015 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_settings_sicherung_20261015 FROM anon, authenticated;

CREATE TEMP TABLE _ohne_satz ON COMMIT DROP AS
WITH kandidaten AS (
  SELECT r.user_id FROM public.user_roles r
   WHERE r.role::text IN ('vertriebspartner', 'vertriebsleiter')
  UNION
  SELECT s.user_id FROM public.user_settings s
   WHERE trim(coalesce(s.einstellungen ->> 'karriere_override', '')) <> ''
)
SELECT
  k.user_id,
  s.einstellungen,
  (s.user_id IS NOT NULL) AS war_vorhanden,
  -- Wie bisher in provisionssatz_fuer_partner, Schritte 3 und 4.
  coalesce(
    public.karriere_stufe_rate(s.einstellungen ->> 'karriere_override'),
    (SELECT ks.rate FROM public.karriere_stufen ks ORDER BY ks.sortierung LIMIT 1)
  ) AS satz
FROM kandidaten k
LEFT JOIN public.user_settings s ON s.user_id = k.user_id
WHERE public.einstellung_zahl(coalesce(s.einstellungen, '{}'::jsonb), 'custom_provision_rate') IS NULL
  AND public.einstellung_zahl(coalesce(s.einstellungen, '{}'::jsonb), 'custom_provision_rate_setter') IS NULL
  AND public.einstellung_zahl(coalesce(s.einstellungen, '{}'::jsonb), 'custom_provision_rate_eigen') IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM _ohne_satz WHERE satz IS NULL OR satz <= 0) THEN
    RAISE EXCEPTION 'Fuer mindestens einen Partner ist kein Stufensatz ermittelbar. Nichts geaendert.';
  END IF;
END;
$$;

INSERT INTO public.user_settings_sicherung_20261015 (user_id, einstellungen, war_vorhanden, gesicherter_satz)
SELECT user_id, einstellungen, war_vorhanden, satz FROM _ohne_satz
ON CONFLICT (user_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2) Satz eintragen
-- ---------------------------------------------------------------------------
--
-- Ohne angemeldeten Nutzer laesst user_settings_provision_schuetzen das zu.

UPDATE public.user_settings u
   -- Ein einstellungen, das kein Objekt ist (NULL, []), zaehlt wie leer;
   -- sonst haengte || die Zahl an ein Array an.
   SET einstellungen = (CASE WHEN jsonb_typeof(u.einstellungen) = 'object' THEN u.einstellungen ELSE '{}'::jsonb END)
                       || jsonb_build_object('custom_provision_rate', o.satz),
       updated_at = now()
  FROM _ohne_satz o
 WHERE o.user_id = u.user_id AND o.war_vorhanden;

INSERT INTO public.user_settings (user_id, einstellungen)
SELECT o.user_id, jsonb_build_object('custom_provision_rate', o.satz)
  FROM _ohne_satz o
 WHERE NOT o.war_vorhanden
ON CONFLICT (user_id) DO NOTHING;

-- Gegenprobe: Jetzt hat jeder Betroffene einen Satz, sonst faellt alles zurueck.
DO $$
DECLARE
  _rest integer;
BEGIN
  SELECT count(*) INTO _rest
    FROM _ohne_satz o
    LEFT JOIN public.user_settings s ON s.user_id = o.user_id
   WHERE public.einstellung_zahl(coalesce(s.einstellungen, '{}'::jsonb), 'custom_provision_rate') IS DISTINCT FROM o.satz;
  IF _rest > 0 THEN
    RAISE EXCEPTION '% Partner haben nach dem Eintragen keinen Satz. Nichts geaendert.', _rest;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3) Satzermittlung ohne Stufen-Rueckfall
-- ---------------------------------------------------------------------------
--
-- Wie 20260818140000, Schritte 1 und 2 unveraendert; 3 (karriere_override)
-- und 4 (erste Stufe) entfallen. Spiegel von getEffectiveRateInfoForKontakt
-- in src/lib/karriereStufeHelper.ts.

CREATE OR REPLACE FUNCTION public.provisionssatz_fuer_partner(_partner uuid, _eigen boolean)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _e jsonb := '{}'::jsonb;
  _rate numeric;
BEGIN
  IF _partner IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT coalesce(einstellungen, '{}'::jsonb) INTO _e
    FROM public.user_settings
   WHERE user_id = _partner;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- 1. Der zum Fall passende Satz (eigen bzw. zugewiesen).
  _rate := CASE
    WHEN _eigen THEN public.einstellung_zahl(_e, 'custom_provision_rate_eigen')
    ELSE public.einstellung_zahl(_e, 'custom_provision_rate_setter')
  END;
  IF _rate IS NOT NULL THEN RETURN _rate; END IF;

  -- 2. Der allgemeine Satz (Altbestand und Eintrag aus dieser Migration).
  RETURN public.einstellung_zahl(_e, 'custom_provision_rate');
END;
$$;

COMMENT ON FUNCTION public.provisionssatz_fuer_partner(uuid, boolean) IS
  'Fester Provisionssatz eines Partners aus der Nutzerverwaltung: Eigen- bzw. '
  'Lead-Satz, sonst der allgemeine Satz. Ohne Satz NULL, keine Karrierestufe '
  '(seit 20261015120000).';

REVOKE ALL ON FUNCTION public.provisionssatz_fuer_partner(uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provisionssatz_fuer_partner(uuid, boolean) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Ergebnis (aendert nichts): wie viele Partner einen Satz eingetragen bekommen
-- haben, und mit welchem.
SELECT gesicherter_satz, count(*) AS partner, count(*) FILTER (WHERE NOT war_vorhanden) AS zeile_neu_angelegt
  FROM public.user_settings_sicherung_20261015
 GROUP BY gesicherter_satz
 ORDER BY gesicherter_satz;
