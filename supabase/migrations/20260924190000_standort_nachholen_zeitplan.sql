-- ===========================================================================
-- Umgebung automatisch messen: Zeitplan für `standort-nachholen`
-- ===========================================================================
--
-- Christian am 24.09.2026: Jedes Objekt hat eine Adresse, also wird die
-- Umgebung für jedes Objekt automatisch gemessen, ohne Knopf. Die Edge
-- Function `standort-nachholen` misst je Lauf höchstens zwei Objekte, die
-- noch keine Messung haben, deren Adresse sich geändert hat oder deren
-- Messung älter ist als die Messfassung 2. Scheitert eine Messung an der
-- Adresse, steht der Grund am Objekt und dieselbe Adresse wird nicht erneut
-- versucht.
--
-- Alle zehn Minuten, also höchstens zwölf Messungen je Stunde. Ein neues
-- Objekt und jede geänderte Adresse sind damit binnen Minuten gemessen, und
-- OpenStreetMap (Photon, Nominatim, Overpass) wird nur gleichmäßig und
-- sparsam gefragt.
--
-- Die Migration ändert keine Tabelle. Ohne sie läuft alles wie bisher: Es
-- misst dann nur der Investagon-Import.
--
-- VORHER: die Function `standort-nachholen` in Lovable ausrollen. Läuft der
-- Zeitplan gegen eine nicht ausgerollte Function, antwortet sie mit 404, und
-- es passiert nichts weiter.
--
-- Mehrfaches Ausführen ist unschädlich: Ein alter Eintrag wird zuerst
-- entfernt.

DO $$
DECLARE
  _alt RECORD;
  _url text := 'https://DEIN-SUPABASE-PROJEKT.supabase.co/functions/v1/standort-nachholen';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     OR NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    RAISE NOTICE 'pg_cron oder pg_net fehlt, der Zeitplan wurde nicht gesetzt.';
    RETURN;
  END IF;

  FOR _alt IN
    SELECT jobname FROM cron.job
     WHERE jobname = 'standort-nachholen'
        OR command LIKE '%/functions/v1/standort-nachholen%'
  LOOP
    PERFORM cron.unschedule(_alt.jobname);
  END LOOP;

  PERFORM cron.schedule(
    'standort-nachholen',
    '*/10 * * * *',
    format(
      $cron$SELECT net.http_post(url := %L, headers := '{"Content-Type": "application/json"}'::jsonb, body := '{}'::jsonb, timeout_milliseconds := 150000);$cron$,
      _url
    )
  );
  RAISE NOTICE 'Zeitplan "standort-nachholen" gesetzt: alle zehn Minuten.';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Zeitplan für standort-nachholen nicht gesetzt: %. Bitte von Hand anlegen.', SQLERRM;
END $$;

-- Nachsehen, erwartet wird eine Zeile:
--
--     select jobname, schedule, active from cron.job where jobname = 'standort-nachholen';
