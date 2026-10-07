-- ===========================================================================
-- MORE Lotse: neue Unterlagen automatisch auswerten (05.10.2026)
-- ===========================================================================
--
-- WARUM
--
-- Der Lotse wertet Unterlagen bisher nur aus, wenn jemand die Einheit oeffnet
-- (hoechstens sechs je Oeffnen). Seit dem 05.10.2026 wertet ein Zeitplan neue
-- Unterlagen einmalig im Voraus aus, sobald der Investagon-Import (oder ein
-- Hochladen) eine Objekt- oder Einheitsunterlage anlegt.
--
-- WAS DIESE MIGRATION TUT
--
--   1. Tabelle lotse_auswertung_warteschlange: je Objekt eine Zeile, solange
--      dort neue Unterlagen warten. Nur die Dienstrolle liest und schreibt,
--      es gibt keine Regel fuer angemeldete Nutzer.
--   2. Ausloeser trg_lotse_auswertung_objekt und trg_lotse_auswertung_einheit
--      nach jedem INSERT in objekt_dokumente beziehungsweise
--      wohnungs_dokumente: Das Objekt kommt in die Schlange. Ein Fehler hier
--      verhindert nie das Anlegen der Unterlage, er wird nur gewarnt.
--   3. Zeitplan lotse-unterlagen-auswerten alle 10 Minuten: ruft objekt-lotse
--      mit x-internal-secret aus public.automatik_geheimnis(). Die Function
--      nimmt hoechstens fuenf Objekte und acht Unterlagen je Lauf und
--      leert die Schlange, wenn ein Objekt fertig ist. Ist die Schlange leer,
--      geschieht nichts und es entstehen keine KI-Kosten.
--
-- Der oeffentliche Schluessel steht nicht in dieser Datei, er wird wie in
-- 20261004195000 aus einem vorhandenen Zeitplan gelesen (nur Rolle anon).
-- Ohne Geheimwort im Tresor oder ohne Schluessel entstehen Tabelle und
-- Ausloeser trotzdem, nur der Zeitplan nicht.
--
-- REIHENFOLGE
--
-- Erst objekt-lotse ausrollen, dann diese Migration. Aendert keine
-- bestehenden Daten, wiederholbar.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.lotse_auswertung_warteschlange (
  objekt_id uuid PRIMARY KEY REFERENCES public.objekte(id) ON DELETE CASCADE,
  eingetragen_am timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lotse_auswertung_warteschlange ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lotse_auswertung_warteschlange FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.lotse_auswertung_eintragen()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _objekt uuid;
BEGIN
  BEGIN
    IF TG_TABLE_NAME = 'objekt_dokumente' THEN
      _objekt := NEW.objekt_id;
    ELSE
      SELECT w.objekt_id INTO _objekt FROM public.wohnungen w WHERE w.id = NEW.wohnung_id;
    END IF;
    IF _objekt IS NOT NULL THEN
      INSERT INTO public.lotse_auswertung_warteschlange (objekt_id, eingetragen_am)
      VALUES (_objekt, now())
      ON CONFLICT (objekt_id) DO UPDATE SET eingetragen_am = now();
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'lotse_auswertung_eintragen: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.lotse_auswertung_eintragen() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_lotse_auswertung_objekt ON public.objekt_dokumente;
CREATE TRIGGER trg_lotse_auswertung_objekt
  AFTER INSERT ON public.objekt_dokumente
  FOR EACH ROW EXECUTE FUNCTION public.lotse_auswertung_eintragen();

DROP TRIGGER IF EXISTS trg_lotse_auswertung_einheit ON public.wohnungs_dokumente;
CREATE TRIGGER trg_lotse_auswertung_einheit
  AFTER INSERT ON public.wohnungs_dokumente
  FOR EACH ROW EXECUTE FUNCTION public.lotse_auswertung_eintragen();

DO $zeitplan$
DECLARE
  _url text := 'https://irwdgutegmivbtgmftyc.supabase.co/functions/v1/objekt-lotse';
  _anon text;
  _kandidat text;
  _teil text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     OR NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    RAISE WARNING 'pg_cron oder pg_net fehlt. Es wurde kein Zeitplan angelegt.';
    RETURN;
  END IF;

  IF public.automatik_geheimnis() = '' THEN
    RAISE WARNING 'Im Tresor liegt kein Geheimwort unter dem Namen AUTOMATIK_GEHEIMWORT. Es wurde KEIN Zeitplan angelegt.';
    RETURN;
  END IF;

  FOR _kandidat IN
    SELECT (regexp_match(command, 'apikey[^e]{1,8}(eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)'))[1]
      FROM cron.job
     ORDER BY jobid
  LOOP
    CONTINUE WHEN _kandidat IS NULL;
    BEGIN
      _teil := translate(split_part(_kandidat, '.', 2), '-_', '+/');
      _teil := rpad(_teil, ((length(_teil) + 3) / 4) * 4, '=');
      IF convert_from(decode(_teil, 'base64'), 'UTF8')::jsonb ->> 'role' = 'anon' THEN
        _anon := _kandidat;
        EXIT;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      CONTINUE;
    END;
  END LOOP;

  IF _anon IS NULL THEN
    RAISE WARNING 'In keinem vorhandenen Zeitplan steht ein oeffentlicher Schluessel (apikey, Rolle anon). Es wurde KEIN Zeitplan angelegt.';
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'lotse-unterlagen-auswerten') THEN
    PERFORM cron.unschedule('lotse-unterlagen-auswerten');
  END IF;

  PERFORM cron.schedule(
    'lotse-unterlagen-auswerten',
    '*/10 * * * *',
    format(
      $befehl$SELECT net.http_post(url := %L, headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', %L, 'Authorization', %L, 'x-internal-secret', public.automatik_geheimnis()), body := '{"aktion":"warteschlange"}'::jsonb, timeout_milliseconds := 150000);$befehl$,
      _url,
      _anon,
      'Bearer ' || _anon
    )
  );
  RAISE NOTICE 'Zeitplan "lotse-unterlagen-auswerten" (objekt-lotse) alle 10 Minuten angelegt.';
END
$zeitplan$;

-- Nachsehen (aendert nichts): Pruefzeilen 87.1 bis 87.3 in
-- supabase/migrations-inbox/99_PRUEFUNG.sql.
