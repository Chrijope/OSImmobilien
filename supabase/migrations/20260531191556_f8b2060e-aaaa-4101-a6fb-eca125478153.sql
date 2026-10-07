CREATE TABLE public.webhook_audit_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source TEXT NOT NULL,
  event TEXT,
  method TEXT,
  status_code INTEGER,
  ip TEXT,
  user_agent TEXT,
  signature_status TEXT NOT NULL DEFAULT 'not_required',
  signature_reason TEXT,
  payload JSONB,
  error_message TEXT,
  duration_ms INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_webhook_audit_log_created_at ON public.webhook_audit_log (created_at DESC);
CREATE INDEX idx_webhook_audit_log_source ON public.webhook_audit_log (source, created_at DESC);
CREATE INDEX idx_webhook_audit_log_signature ON public.webhook_audit_log (signature_status) WHERE signature_status IN ('invalid','missing');

GRANT SELECT ON public.webhook_audit_log TO authenticated;
GRANT ALL ON public.webhook_audit_log TO service_role;

ALTER TABLE public.webhook_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins können Webhook-Logs lesen"
ON public.webhook_audit_log
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'inhaber'));

CREATE POLICY "Service Role schreibt Webhook-Logs"
ON public.webhook_audit_log
FOR INSERT
TO service_role
WITH CHECK (true);

-- Cleanup-Funktion (90 Tage Retention) – kann per cron geplant werden
CREATE OR REPLACE FUNCTION public.purge_old_webhook_audit_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.webhook_audit_log
  WHERE created_at < now() - INTERVAL '90 days';
END;
$$;

REVOKE ALL ON FUNCTION public.purge_old_webhook_audit_logs() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_old_webhook_audit_logs() TO service_role;