DROP FUNCTION IF EXISTS public.get_activation_token(uuid);
CREATE FUNCTION public.get_activation_token(_token uuid)
RETURNS TABLE(
  token uuid,
  email text,
  kontakt_id uuid,
  portal text,
  kunde_name text,
  next text,
  role text,
  user_id uuid,
  expires_at timestamp with time zone,
  used boolean,
  expired boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    t.token,
    t.email,
    t.kontakt_id,
    t.portal,
    t.kunde_name,
    t.next,
    t.role,
    t.user_id,
    t.expires_at,
    (t.used_at IS NOT NULL) AS used,
    (t.expires_at <= now()) AS expired
  FROM public.activation_tokens t
  WHERE t.token = _token
  LIMIT 1
$$;
REVOKE EXECUTE ON FUNCTION public.get_activation_token(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_activation_token(uuid) TO service_role;