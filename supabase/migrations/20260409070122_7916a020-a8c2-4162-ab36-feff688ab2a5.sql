
-- Drop overly permissive anon update policy
DROP POLICY IF EXISTS "Anon can mark token used" ON public.sa_fill_tokens;

-- More restrictive: anon can only update status to 'used' on valid pending tokens
CREATE POLICY "Anon can mark token used"
  ON public.sa_fill_tokens FOR UPDATE
  TO anon
  USING (status = 'pending' AND expires_at > now())
  WITH CHECK (status = 'used');
