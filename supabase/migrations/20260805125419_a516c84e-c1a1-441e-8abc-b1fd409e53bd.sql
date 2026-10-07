DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'mail-nachzuegler-stuendlich') THEN
      PERFORM cron.unschedule('mail-nachzuegler-stuendlich');
    END IF;

    PERFORM cron.schedule(
      'mail-nachzuegler-stuendlich',
      '5 * * * *',
      $cron$
      SELECT net.http_post(
        url := 'https://irwdgutegmivbtgmftyc.supabase.co/functions/v1/mail-nachzuegler',
        headers := '{"Content-Type": "application/json"}'::jsonb,
        body := '{}'::jsonb
      );
      $cron$
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Zeitplan fuer mail-nachzuegler nicht gesetzt: %. Bitte von Hand anlegen.', SQLERRM;
END $$;