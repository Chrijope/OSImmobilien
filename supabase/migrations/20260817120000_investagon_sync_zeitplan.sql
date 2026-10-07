-- ===========================================================================
-- Taegliche Synchronisierung mit Investagon
-- ===========================================================================
--
-- Ruft die Edge Function `investagon-import` jede Nacht um 02:30 UTC mit
-- {"sync": true, "bilder": true} auf. Die Function laeuft dann als
-- Systemlauf: Sie holt Projekte, Einheiten und Bilder aus der Investagon-API,
-- legt Neues an, aktualisiert Vorhandenes und protokolliert den Bericht im
-- activity_log. Der Aufruf kommt ohne Anmeldetoken, deshalb liefert der
-- Sync-Weg nur Stueckzahlen zurueck und ist in der Function selbst auf vier
-- Laeufe je Stunde begrenzt.
--
-- 02:30 UTC liegt vor der Nachtpruefung (03:00) und deutlich vor
-- Arbeitsbeginn: Wenn morgens jemand in die Objekte schaut, ist der Stand
-- von heute Nacht schon da.
--
-- Nach dem Muster von 20260807170000_eskalationsdienste_zeitplan.sql wird
-- vorher JEDER Job entfernt, dessen Befehl auf dieselbe Function zeigt, auch
-- wenn er anders heisst. Ein von Hand angelegter Job liefe sonst doppelt.
--
-- Der Zeitplan ist nur Komfort: Ohne diese Migration funktioniert der
-- Import weiterhin ueber den Dialog im CRM, es laeuft nur nichts von allein.

DO $$
DECLARE
  _alt RECORD;
  _url text := 'https://DEIN-SUPABASE-PROJEKT.supabase.co/functions/v1/investagon-import';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron ist nicht installiert, der Investagon-Zeitplan wurde nicht gesetzt.';
    RETURN;
  END IF;

  FOR _alt IN
    SELECT jobname FROM cron.job
     WHERE jobname = 'investagon-sync-taeglich'
        OR command LIKE '%/functions/v1/investagon-import%'
  LOOP
    BEGIN
      PERFORM cron.unschedule(_alt.jobname);
      RAISE NOTICE 'Alter Zeitplan "%" entfernt.', _alt.jobname;
    EXCEPTION WHEN OTHERS THEN
      -- Gehoert der Job einer anderen Rolle, kommt man nicht heran. Dann ist
      -- ein lauter Hinweis besser als ein stiller Doppellauf.
      RAISE WARNING 'Zeitplan "%" konnte nicht entfernt werden: %. Bitte von Hand loeschen, sonst laeuft investagon-import doppelt.',
        _alt.jobname, SQLERRM;
    END;
  END LOOP;

  PERFORM cron.schedule(
    'investagon-sync-taeglich',
    '30 2 * * *',
    format(
      $cron$SELECT net.http_post(url := %L, headers := '{"Content-Type": "application/json"}'::jsonb, body := '{"sync": true, "bilder": true}'::jsonb);$cron$,
      _url
    )
  );
  RAISE NOTICE 'Zeitplan "investagon-sync-taeglich" gesetzt: 30 2 * * * ruft %.', _url;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Investagon-Zeitplan nicht gesetzt: %. Bitte von Hand anlegen.', SQLERRM;
END $$;
