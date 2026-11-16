-- ===========================================================================
-- Finanzierungsanfrage: Stand und PDF schreibt nur der Server (Christian, 16.11.2026)
-- ===========================================================================
--
-- `investments.meta.finanzierungsanfrage` (gesendet, unterschrieben, pdfPath)
-- setzen nur `send-finanzierungsanfrage-signatur` und
-- `finalize-finanzierungsanfrage` mit dem Dienstschlüssel. Ohne diesen Eintrag
-- könnte der Browser „unterschrieben“ selbst setzen. Wortlaut wie
-- 20261030150000, neu ist nur 'finanzierungsanfrage'.
--
-- Rücknahme: die Funktion aus 20261030150000 erneut einspielen.
-- ===========================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.investment_geschuetzte_schluessel()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT ARRAY[
    'saSigned', 'saSignedAt', 'saSignatures', 'saPdf',
    'rvSigned', 'rvSignedAt', 'rvSignatures', 'rvPdf', 'rvPdfPath', 'rvData',
    'rvVertragsdatum', 'rvWiderrufWahl', 'rvReservierungAb', 'rvReservierungWirksamAm',
    'notarTerminBestaetigt', 'aftersalesBeratung',
    'abwicklung', 'kaufpreisEingegangen', 'kaufpreisEingegangenDatum',
    'kaufpreisfaelligkeitDatum', 'grundbuchEingetragen', 'grundbuchDatum',
    'mietzuzahlung', 'finanzierungsanfrage'
  ]::text[];
$$;

COMMENT ON FUNCTION public.investment_geschuetzte_schluessel() IS
  'Schluessel in investments.meta, die nur Admin, Inhaber, der Server und die '
  'geprueften Funktionen setzen. Siehe 20260930110000, mietzuzahlung seit 20261030150000, '
  'finanzierungsanfrage seit 20261116120000.';

REVOKE ALL ON FUNCTION public.investment_geschuetzte_schluessel() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.investment_geschuetzte_schluessel() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
