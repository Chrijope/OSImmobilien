DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'signatur-erinnerung-daily') THEN
      PERFORM cron.unschedule('signatur-erinnerung-daily');
    END IF;

    PERFORM cron.schedule(
      'signatur-erinnerung-daily',
      '20 6 * * *',
      $cron$
      SELECT net.http_post(
        url := 'https://DEIN-SUPABASE-PROJEKT.supabase.co/functions/v1/signatur-erinnerung',
        headers := '{"Content-Type": "application/json"}'::jsonb,
        body := '{}'::jsonb
      );
      $cron$
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Zeitplan fuer die Signatur-Erinnerung nicht gesetzt: %. Bitte von Hand anlegen.', SQLERRM;
END $$;

COMMENT ON FUNCTION public.nachtpruefung_lauf() IS
  'Naechtliche Pruefung der Daten auf Luecken, Haenger und stille Fehler. '
  'Befunde in nachtpruefung_befunde, Bericht ueber nachtpruefung_bericht(). '
  'Abgelaufene Unterschriften werden zusaetzlich taeglich von der Function '
  'signatur-erinnerung aufgegriffen, die dem zustaendigen Berater eine '
  'Aufgabe anlegt.';