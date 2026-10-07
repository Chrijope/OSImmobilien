-- Tag 6 / Punkt 14: zentrale Token-Cleanup-Funktion + täglicher Cron

CREATE OR REPLACE FUNCTION public.cleanup_expired_tokens()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_activation int := 0;
  v_sa int := 0;
  v_unsub int := 0;
  v_scan int := 0;
  v_sig int := 0;
BEGIN
  -- activation_tokens: abgelaufen >7d ODER verbraucht >30d
  DELETE FROM public.activation_tokens
   WHERE (expires_at IS NOT NULL AND expires_at < now() - interval '7 days')
      OR (used_at   IS NOT NULL AND used_at   < now() - interval '30 days');
  GET DIAGNOSTICS v_activation = ROW_COUNT;

  -- sa_fill_tokens: abgelaufen >7d
  DELETE FROM public.sa_fill_tokens
   WHERE expires_at IS NOT NULL AND expires_at < now() - interval '7 days';
  GET DIAGNOSTICS v_sa = ROW_COUNT;

  -- email_unsubscribe_tokens: verbraucht >90d (Token selbst läuft nicht ab)
  DELETE FROM public.email_unsubscribe_tokens
   WHERE used_at IS NOT NULL AND used_at < now() - interval '90 days';
  GET DIAGNOSTICS v_unsub = ROW_COUNT;

  -- mobile_scan_sessions: abgelaufen >2d
  DELETE FROM public.mobile_scan_sessions
   WHERE expires_at IS NOT NULL AND expires_at < now() - interval '2 days';
  GET DIAGNOSTICS v_scan = ROW_COUNT;

  -- signature_requests: abgelaufen >180d (Audit-relevant, daher länger)
  DELETE FROM public.signature_requests
   WHERE expires_at IS NOT NULL AND expires_at < now() - interval '180 days';
  GET DIAGNOSTICS v_sig = ROW_COUNT;

  RETURN jsonb_build_object(
    'activation_tokens', v_activation,
    'sa_fill_tokens', v_sa,
    'email_unsubscribe_tokens', v_unsub,
    'mobile_scan_sessions', v_scan,
    'signature_requests', v_sig,
    'ran_at', now()
  );
END;
$$;

-- Täglich 03:45 UTC (nach audit/email cleanups)
DO $$
BEGIN
  PERFORM cron.unschedule('cleanup-expired-tokens-daily');
EXCEPTION WHEN OTHERS THEN NULL;
END;
$$;

SELECT cron.schedule(
  'cleanup-expired-tokens-daily',
  '45 3 * * *',
  $$SELECT public.cleanup_expired_tokens();$$
);