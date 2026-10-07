
DROP POLICY "Token-basiert signieren v2" ON public.signature_requests;

CREATE POLICY "Token-basiert signieren v2" ON public.signature_requests
  FOR UPDATE
  TO anon, authenticated
  USING ((expires_at > now()) AND (status = 'pending'::text))
  WITH CHECK ((expires_at > now()) AND (status = 'signed'::text));
