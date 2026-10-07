CREATE OR REPLACE FUNCTION public.kennzahlen_tagesstand_nordstern()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tag date := (now() AT TIME ZONE 'Europe/Berlin')::date;
  v_von date := date_trunc('month', (now() AT TIME ZONE 'Europe/Berlin'))::date;
  v_bis date := (date_trunc('month', (now() AT TIME ZONE 'Europe/Berlin')) + interval '1 month - 1 day')::date;
  v_zahl bigint;
  v_summe numeric;
  v_geschrieben integer := 0;
BEGIN
  -- VL.notartermine_monat: Notartermin (meta.notarData.datum, sonst meta.notarTermin) im laufenden Monat
  BEGIN
    SELECT count(*) INTO v_zahl
      FROM public.investments i
     WHERE coalesce(i.status, '') NOT IN ('storniert', 'geloescht')
       AND coalesce(public.kennzahl_stufe(i.meta->>'pipelineStufe'), '') NOT IN ('verloren', 'archiviert')
       AND coalesce(public.kennzahl_datum(i.meta->'notarData'->>'datum'),
                    public.kennzahl_datum(i.meta->>'notarTermin')) BETWEEN v_von AND v_bis;
    PERFORM public.kennzahl_schreiben(v_tag, 'VL', 'notartermine_monat', v_zahl);
    v_geschrieben := v_geschrieben + 1;
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'VL.notartermine_monat uebersprungen: %', SQLERRM;
  END;

  -- VL.volumen_beurkundet_monat: Kaufpreise der Termine vom Monatsersten bis heute
  BEGIN
    SELECT round(coalesce(sum(public.kennzahl_investment_preis(i.meta, i.kaufpreis)), 0)) INTO v_summe
      FROM public.investments i
     WHERE coalesce(i.status, '') NOT IN ('storniert', 'geloescht')
       AND coalesce(public.kennzahl_stufe(i.meta->>'pipelineStufe'), '') NOT IN ('verloren', 'archiviert')
       AND coalesce(public.kennzahl_datum(i.meta->'notarData'->>'datum'),
                    public.kennzahl_datum(i.meta->>'notarTermin')) BETWEEN v_von AND v_tag;
    PERFORM public.kennzahl_schreiben(v_tag, 'VL', 'volumen_beurkundet_monat', v_summe);
    v_geschrieben := v_geschrieben + 1;
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'VL.volumen_beurkundet_monat uebersprungen: %', SQLERRM;
  END;

  RETURN v_geschrieben;
END;
$$;

REVOKE ALL ON FUNCTION public.kennzahlen_tagesstand_nordstern() FROM public, anon, authenticated;

DO $$
DECLARE j record;
BEGIN
  FOR j IN SELECT jobid, command FROM cron.job
            WHERE command ILIKE '%kennzahlen_tagesstand_lauf%'
              AND command NOT ILIKE '%kennzahlen_tagesstand_nordstern%'
  LOOP
    PERFORM cron.alter_job(j.jobid, command := rtrim(j.command) || ' SELECT public.kennzahlen_tagesstand_nordstern();');
  END LOOP;
END $$;

SELECT public.kennzahlen_tagesstand_nordstern();