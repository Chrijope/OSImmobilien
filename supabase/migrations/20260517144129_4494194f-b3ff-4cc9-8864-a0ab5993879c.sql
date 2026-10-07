DROP POLICY IF EXISTS "Mobile scan read via token" ON storage.objects;

CREATE POLICY "Mobile scan read via token"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'unterlagen'
  AND (storage.foldername(name))[1] = 'mobile-scans'
  AND EXISTS (
    SELECT 1 FROM public.mobile_scan_sessions s
    WHERE s.token = (storage.foldername(name))[2]
      AND s.expires_at > now()
  )
);