-- Cleanup-Funktion erweitern: korrupte Queue-Nachrichten direkt entfernen
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
  purged_malformed_trans bigint := 0;
  purged_malformed_auth bigint := 0;
BEGIN
  -- Failed-Logs älter als 3 Tage löschen
  DELETE FROM public.email_send_log
  WHERE status IN ('failed','dlq','bounced','complained','suppressed','rate_limited')
    AND created_at < now() - interval '3 days';
  GET DIAGNOSTICS deleted_failed_logs = ROW_COUNT;

  -- Sent-Logs älter als 30 Tage löschen
  DELETE FROM public.email_send_log
  WHERE status = 'sent' AND created_at < now() - interval '30 days';
  GET DIAGNOSTICS deleted_old_sent_logs = ROW_COUNT;

  -- "Stuck" pending-Logs (>24h ohne Status-Update) löschen
  DELETE FROM public.email_send_log
  WHERE status = 'pending' AND created_at < now() - interval '24 hours';
  GET DIAGNOSTICS deleted_stuck_pending = ROW_COUNT;

  -- DLQ-Einträge älter als 7 Tage löschen
  DELETE FROM pgmq.q_auth_emails_dlq WHERE enqueued_at < now() - interval '7 days';
  GET DIAGNOSTICS purged_auth_dlq = ROW_COUNT;

  DELETE FROM pgmq.q_transactional_emails_dlq WHERE enqueued_at < now() - interval '7 days';
  GET DIAGNOSTICS purged_trans_dlq = ROW_COUNT;

  -- Aktive Queues: chronische Failures (read_ct > 50)
  DELETE FROM pgmq.q_auth_emails WHERE read_ct > 50;
  GET DIAGNOSTICS purged_auth_q = ROW_COUNT;

  DELETE FROM pgmq.q_transactional_emails WHERE read_ct > 50;
  GET DIAGNOSTICS purged_trans_q = ROW_COUNT;

  -- Malformed Nachrichten in transactional_emails ohne text/html/to entfernen
  -- (Altbestand vor dem Bugfix; diese können niemals erfolgreich versendet werden)
  DELETE FROM pgmq.q_transactional_emails
  WHERE NOT (message ? 'text')
     OR message->>'text' IS NULL
     OR message->>'text' = ''
     OR NOT (message ? 'to')
     OR message->>'to' IS NULL
     OR message->>'to' = '';
  GET DIAGNOSTICS purged_malformed_trans = ROW_COUNT;

  -- Malformed Nachrichten in auth_emails ohne run_id/text entfernen
  DELETE FROM pgmq.q_auth_emails
  WHERE NOT (message ? 'run_id')
     OR message->>'run_id' IS NULL
     OR message->>'run_id' = ''
     OR NOT (message ? 'text')
     OR message->>'text' IS NULL
     OR message->>'text' = ''
     OR NOT (message ? 'to')
     OR message->>'to' IS NULL
     OR message->>'to' = '';
  GET DIAGNOSTICS purged_malformed_auth = ROW_COUNT;

  RETURN jsonb_build_object(
    'deleted_failed_logs', deleted_failed_logs,
    'deleted_old_sent_logs', deleted_old_sent_logs,
    'deleted_stuck_pending', deleted_stuck_pending,
    'purged_auth_dlq', purged_auth_dlq,
    'purged_trans_dlq', purged_trans_dlq,
    'purged_auth_q', purged_auth_q,
    'purged_trans_q', purged_trans_q,
    'purged_malformed_trans', purged_malformed_trans,
    'purged_malformed_auth', purged_malformed_auth,
    'run_at', now()
  );
END;
$$;

-- Sofort ausführen, um die fehlerhaften Altbestand-Nachrichten aus der Queue zu räumen
SELECT public.cleanup_email_artifacts();