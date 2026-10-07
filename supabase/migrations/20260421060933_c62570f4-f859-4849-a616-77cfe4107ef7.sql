-- E-Mail-Versand auf maximalen Durchsatz konfigurieren
UPDATE email_send_state
SET batch_size = 100, send_delay_ms = 0
WHERE id = 1;

-- Cron-Job auf jede Minute setzen (schnellster Wert, der pg_cron erlaubt)
-- OSImmobilien: Der Job wird nicht in einer Migration angelegt. Auf einer
-- frischen Datenbank fehlt er, dann wird hier nichts geaendert.
DO $$
DECLARE
  _jobid bigint;
BEGIN
  SELECT jobid INTO _jobid FROM cron.job WHERE jobname = 'process-email-queue';
  IF _jobid IS NOT NULL THEN
    PERFORM cron.alter_job(_jobid, schedule := '* * * * *');
  END IF;
END $$;