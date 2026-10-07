CREATE OR REPLACE FUNCTION public.get_tippgeber_vp_profile()
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
  FROM public.profiles p
  JOIN public.tippgeber t ON t.zugeordnet_id = p.id
  LEFT JOIN public.user_settings us ON us.user_id = p.id
  WHERE t.benutzer_id = auth.uid()
  LIMIT 1;
$function$;