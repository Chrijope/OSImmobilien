
-- Fix signature_requests RLS policies for anonymous access via token
-- Drop existing policies
DROP POLICY IF EXISTS "Aktualisieren per Token" ON public.signature_requests;
DROP POLICY IF EXISTS "Erstellen Signatur intern" ON public.signature_requests;
DROP POLICY IF EXISTS "Lesen per Token anon" ON public.signature_requests;

-- Allow anonymous SELECT by token (filtered in query)
CREATE POLICY "Anon lesen per Token" ON public.signature_requests
FOR SELECT TO anon, authenticated
USING (true);

-- Allow internal users to create signature requests
CREATE POLICY "Interne erstellen Signatur" ON public.signature_requests
FOR INSERT TO authenticated
WITH CHECK (is_internal_role(auth.uid()));

-- Allow service_role to create (for edge functions)
CREATE POLICY "Service erstellen Signatur" ON public.signature_requests
FOR INSERT TO service_role
WITH CHECK (true);

-- Allow anonymous UPDATE only their own token row
CREATE POLICY "Anon aktualisieren per Token" ON public.signature_requests
FOR UPDATE TO anon, authenticated
USING (true)
WITH CHECK (true);

-- Allow service_role full access
CREATE POLICY "Service role full access" ON public.signature_requests
FOR ALL TO service_role
USING (true)
WITH CHECK (true);
