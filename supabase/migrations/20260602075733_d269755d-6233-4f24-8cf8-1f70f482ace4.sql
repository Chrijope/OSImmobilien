-- Ensure mobile-scan storage upload works reliably for all customer scan sessions.
-- Supabase Storage uses both create/update semantics when the client sends upsert headers.
DROP POLICY IF EXISTS "Mobile scan upload via token" ON storage.objects;
DROP POLICY IF EXISTS "Mobile scan update via token" ON storage.objects;

CREATE POLICY "Mobile scan upload via token"
ON storage.objects
FOR INSERT
TO anon, authenticated
WITH CHECK (
  bucket_id = 'unterlagen'
  AND (storage.foldername(name))[1] = 'mobile-scans'
  AND public.is_mobile_scan_token_open((storage.foldername(name))[2])
);

CREATE POLICY "Mobile scan update via token"
ON storage.objects
FOR UPDATE
TO anon, authenticated
USING (
  bucket_id = 'unterlagen'
  AND (storage.foldername(name))[1] = 'mobile-scans'
  AND public.is_mobile_scan_token_open((storage.foldername(name))[2])
)
WITH CHECK (
  bucket_id = 'unterlagen'
  AND (storage.foldername(name))[1] = 'mobile-scans'
  AND public.is_mobile_scan_token_open((storage.foldername(name))[2])
);