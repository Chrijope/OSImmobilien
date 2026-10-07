ALTER TABLE public.videoraeume
  ADD COLUMN IF NOT EXISTS signal_geheimnis text,
  ADD COLUMN IF NOT EXISTS notiz text;

ALTER TABLE public.videoraeume
  ALTER COLUMN transkript_angeboten SET DEFAULT false;

CREATE OR REPLACE FUNCTION public.videoraum_gast_status(_gast_token text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'status', t.status,
    'raum_status', r.status,
    'name', t.name,
    'teilnehmer_id', t.id,
    'signal_geheimnis', CASE
      WHEN t.status IN ('eingelassen', 'im_gespraech') THEN r.signal_geheimnis
      ELSE NULL
    END,
    'warteposition', (
      SELECT count(*)
      FROM public.videoraum_teilnehmer w
      WHERE w.raum_id = t.raum_id
        AND w.status = 'wartet'
        AND w.beigetreten_at <= t.beigetreten_at
    ),
    'gespraech_laeuft', EXISTS (
      SELECT 1
      FROM public.videoraum_teilnehmer d
      WHERE d.raum_id = t.raum_id
        AND d.id <> t.id
        AND d.status IN ('eingelassen', 'im_gespraech')
    )
  )
  FROM public.videoraum_teilnehmer t
  JOIN public.videoraeume r ON r.id = t.raum_id
  WHERE t.gast_token = _gast_token
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.videoraum_gast_status(text) FROM public;
GRANT EXECUTE ON FUNCTION public.videoraum_gast_status(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.videoraum_ansicht(_token text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'art', r.art,
    'titel', r.titel,
    'status', r.status,
    'termin_at', r.termin_at,
    'dauer_minuten', r.dauer_minuten,
    'agenda', r.agenda,
    'hinweis', r.hinweis,
    'transkript_angeboten', r.transkript_angeboten,
    'gastgeber', r.gastgeber_snapshot,
    'objekt', COALESCE(r.meta -> 'objekt', '{}'::jsonb)
  )
  FROM public.videoraeume r
  WHERE r.token = _token
    AND r.expires_at > now()
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.videoraum_ansicht(text) FROM public;
GRANT EXECUTE ON FUNCTION public.videoraum_ansicht(text) TO anon, authenticated;