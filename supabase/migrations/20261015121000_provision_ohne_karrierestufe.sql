-- ===========================================================================
-- Provision ohne Karrierestufe: Satzermittlung und Wertebereich
-- ===========================================================================
--
-- CHRISTIANS ENTSCHEIDUNG (15.10.2026)
--
--   Keine Karrierestufen und keine Staffel. Jeder Vertriebspartner hat einen
--   Lead- und einen Eigen-Satz aus der Nutzerverwaltung, groesser 0 bis 100.
--   Ohne Satz gibt es keine Provision. Ab der Reservierung gilt der am
--   Investment festgeschriebene Satz (Entscheidung vom 29.09.2026).
--
-- WAS DIESE MIGRATION TUT
--
--   1. provisionssatz_fuer_partner ohne Stufen-Rueckfall: Eigen- bzw.
--      Lead-Satz, sonst der allgemeine Satz, sonst NULL. Signatur bleibt,
--      nur Server und service_role duerfen sie rufen. Der Trigger
--      investments_provisionssatz_festschreiben schreibt NULL nie fest: Er
--      vermerkt 'kein_satz_ermittelbar' und versucht es beim naechsten
--      Speichern erneut (20260929140000).
--   2. Pruefregel user_settings_provisionssatz_bereich: die drei
--      Satz-Schluessel sind leer, null oder eine Zahl groesser 0 bis 100.
--      Verletzen Bestandswerte die Regel, bleibt sie NOT VALID (gilt nur fuer
--      neue Schreibvorgaenge), und die Abweichungen stehen in der Abfrage
--      ganz unten. Sonst wird sie gleich geprueft.
--
--   Der Schutz der Schluessel (nur Admin und Inhaber) besteht schon seit
--   20260929140000 (user_settings_provision_schuetzen) und deckt
--   custom_provision_rate, _setter und _eigen ab.
--
-- AENDERT KEINE DATEN. Die Uebernahme der heutigen Saetze steht in
-- 20261015120000_provision_saetze_uebernehmen.sql und laeuft davor.
-- Mehrfach ausfuehrbar.
-- ===========================================================================

BEGIN;

DO $$
BEGIN
  IF to_regprocedure('public.einstellung_zahl(jsonb,text)') IS NULL
     OR to_regprocedure('public.provisionssatz_ermitteln(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Voraussetzung fehlt. Zuerst 20260818140000 und 20260929140000 ausfuehren.';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 1) Satzermittlung ohne Stufen-Rueckfall
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

  -- 2. Der allgemeine Satz (Altbestand).
  RETURN public.einstellung_zahl(_e, 'custom_provision_rate');
END;
$$;

COMMENT ON FUNCTION public.provisionssatz_fuer_partner(uuid, boolean) IS
  'Fester Provisionssatz eines Partners aus der Nutzerverwaltung: Eigen- bzw. '
  'Lead-Satz, sonst der allgemeine Satz. Ohne Satz NULL, keine Karrierestufe '
  '(seit 20261015120000).';

REVOKE ALL ON FUNCTION public.provisionssatz_fuer_partner(uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provisionssatz_fuer_partner(uuid, boolean) TO service_role;

-- ---------------------------------------------------------------------------
-- 2) Wertebereich der Saetze
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.provisionssatz_im_bereich(_einstellungen jsonb, _key text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT jsonb_typeof(_einstellungen) IS DISTINCT FROM 'object'
      OR NOT (_einstellungen ? _key)
      OR jsonb_typeof(_einstellungen -> _key) = 'null'
      OR (jsonb_typeof(_einstellungen -> _key) = 'number'
          AND (_einstellungen ->> _key)::numeric > 0
          AND (_einstellungen ->> _key)::numeric <= 100);
$$;

ALTER TABLE public.user_settings DROP CONSTRAINT IF EXISTS user_settings_provisionssatz_bereich;
ALTER TABLE public.user_settings
  ADD CONSTRAINT user_settings_provisionssatz_bereich CHECK (
    public.provisionssatz_im_bereich(einstellungen, 'custom_provision_rate')
    AND public.provisionssatz_im_bereich(einstellungen, 'custom_provision_rate_setter')
    AND public.provisionssatz_im_bereich(einstellungen, 'custom_provision_rate_eigen')
  ) NOT VALID;

-- Nur pruefen, wenn der Bestand passt; sonst bleibt die Regel NOT VALID.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.user_settings
     WHERE NOT (public.provisionssatz_im_bereich(einstellungen, 'custom_provision_rate')
            AND public.provisionssatz_im_bereich(einstellungen, 'custom_provision_rate_setter')
            AND public.provisionssatz_im_bereich(einstellungen, 'custom_provision_rate_eigen'))
  ) THEN
    ALTER TABLE public.user_settings VALIDATE CONSTRAINT user_settings_provisionssatz_bereich;
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Abweichungen vom Wertebereich (aendert nichts). Leer heisst: Regel geprueft.
SELECT user_id,
       einstellungen -> 'custom_provision_rate' AS allgemein,
       einstellungen -> 'custom_provision_rate_setter' AS lead,
       einstellungen -> 'custom_provision_rate_eigen' AS eigen
  FROM public.user_settings
 WHERE NOT (public.provisionssatz_im_bereich(einstellungen, 'custom_provision_rate')
        AND public.provisionssatz_im_bereich(einstellungen, 'custom_provision_rate_setter')
        AND public.provisionssatz_im_bereich(einstellungen, 'custom_provision_rate_eigen'));
