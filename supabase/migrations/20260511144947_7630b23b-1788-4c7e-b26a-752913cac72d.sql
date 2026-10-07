
-- Täglicher Cron für Eigene-Investments-Reminders (08:15 Uhr)
SELECT cron.unschedule('eigene-investments-reminders-daily')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'eigene-investments-reminders-daily');

SELECT cron.schedule(
  'eigene-investments-reminders-daily',
  '15 8 * * *',
  $$
  SELECT net.http_post(
    url := 'https://DEIN-SUPABASE-PROJEKT.supabase.co/functions/v1/eigene-investments-reminders',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
