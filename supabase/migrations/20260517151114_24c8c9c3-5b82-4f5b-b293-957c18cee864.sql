
-- 1. Audit-Log: Direkter Insert durch authentifizierte User blockieren.
-- log_audit() ist SECURITY DEFINER und schreibt weiterhin (mit auth.uid() als actor).
DROP POLICY IF EXISTS "Authentifizierte schreiben Audit-Log" ON public.audit_log;

-- Falls etwas direkt schreiben muss, geht das nur via SECURITY DEFINER RPC oder service_role
-- (service_role umgeht RLS ohnehin). Keine INSERT-Policy = kein authenticated INSERT möglich.

-- 2. Mobile-Scan Storage: Token-Status muss 'offen' sein
DROP POLICY IF EXISTS "Mobile scan upload via token" ON storage.objects;

CREATE POLICY "Mobile scan upload via token"
ON storage.objects
FOR INSERT
TO anon, authenticated
WITH CHECK (
  bucket_id = 'unterlagen'
  AND (storage.foldername(name))[1] = 'mobile-scans'
  AND EXISTS (
    SELECT 1 FROM public.mobile_scan_sessions s
    WHERE s.token = (storage.foldername(name))[2]
      AND s.expires_at > now()
      AND s.status = 'offen'
  )
);
