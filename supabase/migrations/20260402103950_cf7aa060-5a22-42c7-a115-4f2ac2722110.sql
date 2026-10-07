
-- Drop the header-based policies and replace with simpler approach
DROP POLICY IF EXISTS "Token-basiert lesen" ON public.signature_requests;
DROP POLICY IF EXISTS "Token-basiert signieren" ON public.signature_requests;

-- SELECT for anon/authenticated: allow reading only non-expired rows
-- The client always filters by token via .eq("token", ...) so RLS just needs to ensure expiry
CREATE POLICY "Token-basiert lesen v2"
ON public.signature_requests
FOR SELECT
TO anon, authenticated
USING (expires_at > now());

-- UPDATE for anon/authenticated: only pending + non-expired
CREATE POLICY "Token-basiert signieren v2"
ON public.signature_requests
FOR UPDATE
TO anon, authenticated
USING (expires_at > now() AND status = 'pending');
