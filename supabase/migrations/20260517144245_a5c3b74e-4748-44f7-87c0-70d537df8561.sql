DROP POLICY IF EXISTS "Public token access" ON public.sa_fill_tokens;

CREATE POLICY "Internal users can read tokens"
ON public.sa_fill_tokens
FOR SELECT
TO authenticated
USING (public.is_internal_role(auth.uid()));

CREATE OR REPLACE FUNCTION public.get_sa_fill_token(_token text)
RETURNS public.sa_fill_tokens
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM public.sa_fill_tokens
  WHERE token = _token
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.get_sa_fill_token(text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_sa_fill_token(text) TO anon, authenticated;