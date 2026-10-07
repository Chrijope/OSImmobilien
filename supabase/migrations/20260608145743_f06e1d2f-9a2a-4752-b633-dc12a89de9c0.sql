CREATE OR REPLACE FUNCTION public.get_user_login_summary()
RETURNS TABLE(user_id uuid, last_seen_at timestamptz, aktiv boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    ls.user_id,
    MAX(ls.last_seen_at) AS last_seen_at,
    bool_or(ls.aktiv AND ls.last_seen_at > now() - interval '15 minutes') AS aktiv
  FROM public.login_sessions ls
  WHERE public.is_internal_role(auth.uid())
  GROUP BY ls.user_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_login_summary() TO authenticated;