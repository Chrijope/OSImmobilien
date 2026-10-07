-- ===========================================================================
-- Zeitplan für den Nachzügler-Dienst
-- ===========================================================================
--
-- Die Function `mail-nachzuegler` war ausgerollt und ohne Anmeldung
-- erreichbar, wurde aber von niemandem gerufen: Der Kommentar im Kopf
-- verwies auf eine Migration, die es nie gab. Der zweite Versuch für
-- Buchungsbestätigungen, die den Kunden nie erreicht haben, fand damit
-- schlicht nicht statt.
--
-- Gefunden vom Sicherheitsprüfer beim ersten Lauf.
--
-- Stündlich zur vollen Stunde. Eine gestörte Mailzustellung ist meist nach
-- ein bis zwei Stunden vorbei, und die Function fasst jede Buchung ohnehin
-- nur ein einziges Mal an.

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
        url := 'https://DEIN-SUPABASE-PROJEKT.supabase.co/functions/v1/mail-nachzuegler',
        headers := '{"Content-Type": "application/json"}'::jsonb,
        body := '{}'::jsonb
      );
      $cron$
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Zeitplan fuer mail-nachzuegler nicht gesetzt: %. Bitte von Hand anlegen.', SQLERRM;
END $$;
