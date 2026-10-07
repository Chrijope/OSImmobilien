-- Lockern: Token-Besitz allein reicht für Upload/Update via Mobile-Scan QR-Code.
-- Status-Check ('offen') wird entfernt, da der Token selbst die Authentifizierung ist.

DROP POLICY IF EXISTS "Mobile scan upload by valid token" ON storage.objects;
DROP POLICY IF EXISTS "Mobile scan read by valid token" ON storage.objects;
DROP POLICY IF EXISTS "Mobile scan update by valid token" ON storage.objects;

CREATE POLICY "Mobile scan upload by valid token"
ON storage.objects
FOR INSERT
TO anon, authenticated
WITH CHECK (
  bucket_id = 'unterlagen'
  AND (storage.foldername(name))[1] = 'mobile-scans'
  AND public.is_mobile_scan_token_valid((storage.foldername(name))[2])
);

CREATE POLICY "Mobile scan read by valid token"
ON storage.objects
FOR SELECT
TO anon, authenticated
USING (
  bucket_id = 'unterlagen'
  AND (storage.foldername(name))[1] = 'mobile-scans'
  AND public.is_mobile_scan_token_valid((storage.foldername(name))[2])
);

CREATE POLICY "Mobile scan update by valid token"
ON storage.objects
FOR UPDATE
TO anon, authenticated
USING (
  bucket_id = 'unterlagen'
  AND (storage.foldername(name))[1] = 'mobile-scans'
  AND public.is_mobile_scan_token_valid((storage.foldername(name))[2])
)
WITH CHECK (
  bucket_id = 'unterlagen'
  AND (storage.foldername(name))[1] = 'mobile-scans'
  AND public.is_mobile_scan_token_valid((storage.foldername(name))[2])
);