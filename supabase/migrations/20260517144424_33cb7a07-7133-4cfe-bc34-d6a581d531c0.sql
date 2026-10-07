DROP POLICY IF EXISTS "Token-basiert lesen v2" ON public.signature_requests;

CREATE OR REPLACE FUNCTION public.get_signature_request(_token text)
RETURNS public.signature_requests
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM public.signature_requests
  WHERE token = _token
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.get_signature_request(text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_signature_request(text) TO anon, authenticated;