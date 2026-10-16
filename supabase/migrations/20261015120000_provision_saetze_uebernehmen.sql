-- ===========================================================================
-- Einmalig: heutigen Provisionssatz als Lead- und Eigen-Satz eintragen
-- ===========================================================================
--
-- CHRISTIANS ENTSCHEIDUNG (15.10.2026)
--
--   Es gibt keine Karrierestufen mehr, nur Lead- und Eigen-Satz aus der
--   Nutzerverwaltung. Bestehende Partner bekommen einmalig ihren heutigen
--   Satz, damit sich still nichts aendert.
--
-- WAS DIESE MIGRATION TUT
--
--   Fuer Vertriebspartner, Vertriebsleiter und jeden mit karriere_override,
--   bei dem custom_provision_rate_setter oder custom_provision_rate_eigen
--   fehlt, wird der fehlende Satz eingetragen, und zwar genau der, der heute
--   wirkt: der allgemeine Satz (custom_provision_rate), sonst der Stufensatz
--   aus karriere_override, sonst die erste Stufe. Ein vorhandener Lead- oder
--   Eigen-Satz bleibt unveraendert. Vorher kommen die betroffenen Zeilen in
--   die Tabelle user_settings_sicherung_20261015.
--
--   Laeuft VOR 20261015121000, die die Stufe aus der Satzermittlung nimmt.
--
-- WAS SICH NICHT AENDERT
--
--   Keine Investments, keine festgeschriebenen Saetze, keine Bescheide.
--   karriere_override, provision_locked und custom_provision_rate bleiben
--   stehen.
--
-- Zuruecksetzen bei Bedarf (Zeilen mit war_vorhanden = false wurden hier neu
-- angelegt und koennen geloescht werden):
--   UPDATE public.user_settings u SET einstellungen = s.einstellungen
--     FROM public.user_settings_sicherung_20261015 s
--    WHERE s.user_id = u.user_id AND s.war_vorhanden;
--
-- Mehrfach ausfuehrbar: Ein zweiter Lauf findet niemanden mehr.
-- Voraussetzung: 20260818140000 (einstellung_zahl, karriere_stufe_rate,
-- karriere_stufen).
-- ===========================================================================

BEGIN;

DO $$
BEGIN
  IF to_regprocedure('public.einstellung_zahl(jsonb,text)') IS NULL
     OR to_regprocedure('public.karriere_stufe_rate(text)') IS NULL
     OR to_regclass('public.karriere_stufen') IS NULL THEN
    RAISE EXCEPTION 'Voraussetzung fehlt. Zuerst 20260818140000 ausfuehren.';
  END IF;
END;
$$;

-- RLS an und keine Policy: ueber die API nicht lesbar.
CREATE TABLE IF NOT EXISTS public.user_settings_sicherung_20261015 (
  user_id uuid PRIMARY KEY,
  einstellungen jsonb,
  war_vorhanden boolean NOT NULL,
  uebernommener_satz numeric NOT NULL,
  gesichert_am timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_settings_sicherung_20261015 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_settings_sicherung_20261015 FROM anon, authenticated;

CREATE TEMP TABLE _uebernahme ON COMMIT DROP AS
WITH kandidaten AS (
  SELECT r.user_id FROM public.user_roles r
   WHERE r.role::text IN ('vertriebspartner', 'vertriebsleiter')
  UNION
  SELECT s.user_id FROM public.user_settings s
   WHERE jsonb_typeof(s.einstellungen) = 'object'
     AND trim(coalesce(s.einstellungen ->> 'karriere_override', '')) <> ''
),
zeilen AS (
  SELECT
    k.user_id,
    s.einstellungen,
    (s.user_id IS NOT NULL) AS war_vorhanden,
    -- Ein einstellungen, das kein Objekt ist (NULL, []), zaehlt wie leer.
    CASE WHEN jsonb_typeof(s.einstellungen) = 'object' THEN s.einstellungen ELSE '{}'::jsonb END AS e
  FROM kandidaten k
  LEFT JOIN public.user_settings s ON s.user_id = k.user_id
)
SELECT
  z.user_id,
  z.einstellungen,
  z.war_vorhanden,
  z.e,
  -- Der heute wirksame Satz, wie provisionssatz_fuer_partner ihn bisher
  -- ermittelt hat (Schritte 2 bis 4).
  coalesce(
    public.einstellung_zahl(z.e, 'custom_provision_rate'),
    public.karriere_stufe_rate(z.e ->> 'karriere_override'),
    (SELECT ks.rate FROM public.karriere_stufen ks ORDER BY ks.sortierung LIMIT 1)
  ) AS satz
FROM zeilen z
WHERE public.einstellung_zahl(z.e, 'custom_provision_rate_setter') IS NULL
   OR public.einstellung_zahl(z.e, 'custom_provision_rate_eigen') IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM _uebernahme WHERE satz IS NULL OR satz <= 0 OR satz > 100) THEN
    RAISE EXCEPTION 'Fuer mindestens einen Partner ist kein gueltiger Satz ermittelbar. Nichts geaendert.';
  END IF;
END;
$$;

INSERT INTO public.user_settings_sicherung_20261015 (user_id, einstellungen, war_vorhanden, uebernommener_satz)
SELECT user_id, einstellungen, war_vorhanden, satz FROM _uebernahme
ON CONFLICT (user_id) DO NOTHING;

-- Ohne angemeldeten Nutzer laesst user_settings_provision_schuetzen das zu.
UPDATE public.user_settings u
   SET einstellungen = o.e
         || jsonb_build_object(
              'custom_provision_rate_setter', coalesce(public.einstellung_zahl(o.e, 'custom_provision_rate_setter'), o.satz),
              'custom_provision_rate_eigen', coalesce(public.einstellung_zahl(o.e, 'custom_provision_rate_eigen'), o.satz)
            ),
       updated_at = now()
  FROM _uebernahme o
 WHERE o.user_id = u.user_id AND o.war_vorhanden;

INSERT INTO public.user_settings (user_id, einstellungen)
SELECT o.user_id, jsonb_build_object('custom_provision_rate_setter', o.satz, 'custom_provision_rate_eigen', o.satz)
  FROM _uebernahme o
 WHERE NOT o.war_vorhanden
ON CONFLICT (user_id) DO NOTHING;

-- Gegenprobe: Jetzt hat jeder Betroffene beide Saetze, sonst faellt alles zurueck.
DO $$
DECLARE
  _rest integer;
BEGIN
  SELECT count(*) INTO _rest
    FROM _uebernahme o
    LEFT JOIN public.user_settings s ON s.user_id = o.user_id
   WHERE public.einstellung_zahl(coalesce(s.einstellungen, '{}'::jsonb), 'custom_provision_rate_setter') IS NULL
      OR public.einstellung_zahl(coalesce(s.einstellungen, '{}'::jsonb), 'custom_provision_rate_eigen') IS NULL;
  IF _rest > 0 THEN
    RAISE EXCEPTION '% Partner haben nach dem Eintragen keine zwei Saetze. Nichts geaendert.', _rest;
  END IF;
END;
$$;

COMMIT;

-- Ergebnis (aendert nichts): wie viele Partner mit welchem Satz.
SELECT uebernommener_satz, count(*) AS partner, count(*) FILTER (WHERE NOT war_vorhanden) AS zeile_neu_angelegt
  FROM public.user_settings_sicherung_20261015
 GROUP BY uebernommener_satz
 ORDER BY uebernommener_satz;
