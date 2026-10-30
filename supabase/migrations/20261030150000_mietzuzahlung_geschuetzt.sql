-- ===========================================================================
-- Mietzuzahlung: Stand und PDF schreibt nur der Server (Christian, 30.10.2026)
-- ===========================================================================
--
-- `investments.meta.mietzuzahlung` (gesendet, unterschrieben, pdfPath)
-- setzen nur `send-mietzuzahlung-signatur` und `finalize-mietzuzahlung` mit
-- dem Dienstschlüssel. Ohne diesen Eintrag könnte der Browser „unterschrieben“
-- selbst setzen. Wortlaut wie 20260930110000, neu ist nur 'mietzuzahlung'.
--
-- Rücknahme: die Funktion aus 20260930110000 erneut einspielen.
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
    'mietzuzahlung'
  ]::text[];
$$;

COMMENT ON FUNCTION public.investment_geschuetzte_schluessel() IS
  'Schluessel in investments.meta, die nur Admin, Inhaber, der Server und die '
  'geprueften Funktionen setzen. Siehe 20260930110000, mietzuzahlung seit 20261030150000.';

REVOKE ALL ON FUNCTION public.investment_geschuetzte_schluessel() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.investment_geschuetzte_schluessel() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
