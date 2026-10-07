
DROP VIEW IF EXISTS public.profiles_public;

CREATE VIEW public.profiles_public
WITH (security_invoker = on) AS
SELECT id, name, email, avatar_url, vp_slug, buchungslink, more_id, created_at
FROM public.profiles;

GRANT SELECT ON public.profiles_public TO anon, authenticated;
