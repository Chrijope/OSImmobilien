CREATE OR REPLACE FUNCTION public.lookup_activation_name(_email text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT split_part(coalesce(p.name, ''), ' ', 1)
  FROM public.profiles p
  WHERE lower(p.email) = lower(_email)
  LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.lookup_activation_name(text) TO anon, authenticated;