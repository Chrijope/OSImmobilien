ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS telefon text;

CREATE OR REPLACE FUNCTION public.get_tippgeber_vp_profile()
RETURNS TABLE (
  id uuid,
  name text,
  email text,
  telefon text,
  avatar_url text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.name, p.email, p.telefon, p.avatar_url
  FROM public.profiles p
  JOIN public.tippgeber t ON t.zugeordnet_id = p.id
  WHERE t.benutzer_id = auth.uid()
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_tippgeber_vp_profile() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_tippgeber_vp_profile() TO service_role;