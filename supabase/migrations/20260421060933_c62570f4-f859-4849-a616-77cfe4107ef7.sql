-- E-Mail-Versand auf maximalen Durchsatz konfigurieren
UPDATE email_send_state
SET batch_size = 100, send_delay_ms = 0
WHERE id = 1;

-- Cron-Job auf jede Minute setzen (schnellster Wert, der pg_cron erlaubt)
SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'process-email-queue'),
  schedule := '* * * * *'
);