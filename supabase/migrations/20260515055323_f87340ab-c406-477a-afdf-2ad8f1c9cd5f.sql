
DROP POLICY IF EXISTS "Anon upload via active scan session" ON storage.objects;

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
    )
  );

CREATE POLICY "Mobile scan read via token"
  ON storage.objects
  FOR SELECT
  TO anon, authenticated
  USING (
    bucket_id = 'unterlagen'
    AND (storage.foldername(name))[1] = 'mobile-scans'
  );
