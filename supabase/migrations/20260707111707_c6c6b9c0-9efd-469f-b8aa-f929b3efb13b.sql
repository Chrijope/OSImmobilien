
CREATE OR REPLACE FUNCTION public.va_team_average()
RETURNS TABLE(team_avg_pct integer, users_count integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH per_user AS (
    SELECT user_id, AVG(pct)::numeric AS user_avg
    FROM public.va_partner_fortschritt
    GROUP BY user_id
  )
  SELECT
    COALESCE(ROUND(AVG(user_avg))::int, 0) AS team_avg_pct,
    COUNT(*)::int AS users_count
  FROM per_user;
$$;

GRANT EXECUTE ON FUNCTION public.va_team_average() TO authenticated;
