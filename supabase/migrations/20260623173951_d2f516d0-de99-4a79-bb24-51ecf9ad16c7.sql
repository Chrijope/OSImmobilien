
CREATE OR REPLACE FUNCTION public.get_kunde_vp_profile()
RETURNS TABLE(id uuid, name text, email text, telefon text, avatar_url text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    p.id,
    p.name,
    p.email,
    COALESCE(
      NULLIF(p.telefon, ''),
      NULLIF(us.einstellungen->'profil'->>'telefon', ''),
      NULLIF(us.einstellungen->>'telefon', '')
    ) AS telefon,
    p.avatar_url
  FROM public.kontakte k
  JOIN public.profiles p ON p.id = k.zustaendig_id
  LEFT JOIN public.user_settings us ON us.user_id = p.id
  WHERE (
    k.meta->>'authUserId' = auth.uid()::text
    OR k.meta->'person2'->>'authUserId' = auth.uid()::text
  )
  AND k.zustaendig_id IS NOT NULL
  ORDER BY k.erstellt_am DESC NULLS LAST
  LIMIT 1;
$function$;

GRANT EXECUTE ON FUNCTION public.get_kunde_vp_profile() TO authenticated;
