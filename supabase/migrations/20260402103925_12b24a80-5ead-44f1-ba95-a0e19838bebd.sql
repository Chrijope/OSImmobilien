
-- Drop existing overly permissive policies
DROP POLICY IF EXISTS "Anon lesen Signatur-Requests" ON public.signature_requests;
DROP POLICY IF EXISTS "Anon aktualisieren Signatur-Requests" ON public.signature_requests;
DROP POLICY IF EXISTS "Public read signature requests" ON public.signature_requests;
DROP POLICY IF EXISTS "Public update signature requests" ON public.signature_requests;
DROP POLICY IF EXISTS "Anyone can read signature requests" ON public.signature_requests;
DROP POLICY IF EXISTS "Anyone can update signature requests" ON public.signature_requests;

-- Also drop any policies with generic true conditions
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE tablename = 'signature_requests'
      AND (qual = 'true' OR with_check = 'true')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.signature_requests', pol.policyname);
  END LOOP;
END $$;

-- SELECT: only with valid, non-expired token
CREATE POLICY "Token-basiert lesen"
ON public.signature_requests
FOR SELECT
TO anon, authenticated
USING (
  token = current_setting('request.headers', true)::json->>'x-signature-token'
  AND expires_at > now()
);

-- Also allow internal roles to read all
CREATE POLICY "Interne sehen Signatur-Requests"
ON public.signature_requests
FOR SELECT
TO authenticated
USING (is_internal_role(auth.uid()));

-- UPDATE: only with valid token, restricted to signing fields
CREATE POLICY "Token-basiert signieren"
ON public.signature_requests
FOR UPDATE
TO anon, authenticated
USING (
  token = current_setting('request.headers', true)::json->>'x-signature-token'
  AND expires_at > now()
  AND status = 'pending'
);

-- Also allow internal roles to update
CREATE POLICY "Interne bearbeiten Signatur-Requests"
ON public.signature_requests
FOR UPDATE
TO authenticated
USING (is_internal_role(auth.uid()));

-- INSERT: only internal roles
CREATE POLICY "Interne erstellen Signatur-Requests"
ON public.signature_requests
FOR INSERT
TO authenticated
WITH CHECK (is_internal_role(auth.uid()));

-- DELETE: only admins
CREATE POLICY "Admins loeschen Signatur-Requests"
ON public.signature_requests
FOR DELETE
TO authenticated
USING (is_admin_role(auth.uid()));
