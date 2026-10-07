-- 1. Helper-Funktion: bereinigt Logs + DLQ + verwaiste pending
CREATE OR REPLACE FUNCTION public.cleanup_email_artifacts()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pgmq'
AS $$
DECLARE
  deleted_failed_logs bigint := 0;
  deleted_old_sent_logs bigint := 0;
  deleted_stuck_pending bigint := 0;
  purged_auth_dlq bigint := 0;
  purged_trans_dlq bigint := 0;
  purged_auth_q bigint := 0;
  purged_trans_q bigint := 0;
BEGIN
  -- Failed-Logs älter als 3 Tage löschen
  DELETE FROM public.email_send_log
  WHERE status IN ('failed','dlq','bounced','complained','suppressed')
    AND created_at < now() - interval '3 days';
  GET DIAGNOSTICS deleted_failed_logs = ROW_COUNT;

  -- Sent-Logs älter als 30 Tage löschen
  DELETE FROM public.email_send_log
  WHERE status = 'sent' AND created_at < now() - interval '30 days';
  GET DIAGNOSTICS deleted_old_sent_logs = ROW_COUNT;

  -- "Stuck" pending-Logs (>24h ohne Status-Update) als failed markieren und löschen
  DELETE FROM public.email_send_log
  WHERE status = 'pending' AND created_at < now() - interval '24 hours';
  GET DIAGNOSTICS deleted_stuck_pending = ROW_COUNT;

  -- DLQ-Einträge älter als 7 Tage löschen
  DELETE FROM pgmq.q_auth_emails_dlq WHERE enqueued_at < now() - interval '7 days';
  GET DIAGNOSTICS purged_auth_dlq = ROW_COUNT;

  DELETE FROM pgmq.q_transactional_emails_dlq WHERE enqueued_at < now() - interval '7 days';
  GET DIAGNOSTICS purged_trans_dlq = ROW_COUNT;

  -- Aktive Queues: Nachrichten mit read_ct > 50 (chronische Failures) entfernen
  DELETE FROM pgmq.q_auth_emails WHERE read_ct > 50;
  GET DIAGNOSTICS purged_auth_q = ROW_COUNT;

  DELETE FROM pgmq.q_transactional_emails WHERE read_ct > 50;
  GET DIAGNOSTICS purged_trans_q = ROW_COUNT;

  RETURN jsonb_build_object(
    'deleted_failed_logs', deleted_failed_logs,
    'deleted_old_sent_logs', deleted_old_sent_logs,
    'deleted_stuck_pending', deleted_stuck_pending,
    'purged_auth_dlq', purged_auth_dlq,
    'purged_trans_dlq', purged_trans_dlq,
    'purged_auth_q', purged_auth_q,
    'purged_trans_q', purged_trans_q,
    'run_at', now()
  );
END;
$$;

-- 2. Stündlich automatisch aufräumen
SELECT cron.unschedule('cleanup-email-artifacts')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-email-artifacts');

SELECT cron.schedule(
  'cleanup-email-artifacts',
  '0 * * * *',  -- jede volle Stunde
  $$ SELECT public.cleanup_email_artifacts(); $$
);

-- 3. Sofortige Erstbereinigung ausführen
SELECT public.cleanup_email_artifacts();