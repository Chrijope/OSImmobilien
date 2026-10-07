CREATE OR REPLACE FUNCTION public.restore_activation_token(_token uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.activation_tokens SET used_at = NULL WHERE token = _token;
$$;
REVOKE EXECUTE ON FUNCTION public.restore_activation_token(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.restore_activation_token(uuid) TO service_role;