
-- Helper: check if a mobile-scan token is currently open (security definer to bypass RLS)
CREATE OR REPLACE FUNCTION public.is_mobile_scan_token_open(_token text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.mobile_scan_sessions s
    WHERE s.token = _token
      AND s.expires_at > now()
      AND s.status = 'offen'
  )
$$;

GRANT EXECUTE ON FUNCTION public.is_mobile_scan_token_open(text) TO anon, authenticated;

-- Helper: check if a mobile-scan token exists and is not expired (for SELECT/read)
CREATE OR REPLACE FUNCTION public.is_mobile_scan_token_valid(_token text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.mobile_scan_sessions s
    WHERE s.token = _token
      AND s.expires_at > now()
  )
$$;

GRANT EXECUTE ON FUNCTION public.is_mobile_scan_token_valid(text) TO anon, authenticated;

-- Replace the storage policies that referenced mobile_scan_sessions directly
-- (the EXISTS subquery ran with anon privileges and was blocked by RLS,
--  causing "new row violates row-level security policy" on upload).
DROP POLICY IF EXISTS "Mobile scan upload via token" ON storage.objects;
DROP POLICY IF EXISTS "Mobile scan read via token" ON storage.objects;

CREATE POLICY "Mobile scan upload via token"
ON storage.objects
FOR INSERT
TO anon, authenticated
WITH CHECK (
  bucket_id = 'unterlagen'
  AND (storage.foldername(name))[1] = 'mobile-scans'
  AND public.is_mobile_scan_token_open((storage.foldername(name))[2])
);

CREATE POLICY "Mobile scan read via token"
ON storage.objects
FOR SELECT
TO anon, authenticated
USING (
  bucket_id = 'unterlagen'
  AND (storage.foldername(name))[1] = 'mobile-scans'
  AND public.is_mobile_scan_token_valid((storage.foldername(name))[2])
);

-- Also allow UPDATE so that supabase storage `upsert: true` does not fail
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
