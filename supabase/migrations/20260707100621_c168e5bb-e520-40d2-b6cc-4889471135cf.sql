
-- Purge-Funktion: löscht activity_log-Einträge älter als 180 Tage
CREATE OR REPLACE FUNCTION public.purge_old_activity_log()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM public.activity_log
  WHERE created_at < now() - interval '180 days';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- Bestehenden Job (falls vorhanden) entfernen und neu planen
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge_activity_log_daily') THEN
    PERFORM cron.unschedule('purge_activity_log_daily');
  END IF;
END $$;

SELECT cron.schedule(
  'purge_activity_log_daily',
  '15 3 * * *',
  $$SELECT public.purge_old_activity_log();$$
);
