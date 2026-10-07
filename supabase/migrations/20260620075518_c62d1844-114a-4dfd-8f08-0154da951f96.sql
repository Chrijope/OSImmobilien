CREATE OR REPLACE FUNCTION public.increment_tippgeber_klick(_tippgeber text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id uuid;
BEGIN
  IF _tippgeber IS NULL OR length(_tippgeber) = 0 THEN
    RETURN;
  END IF;

  BEGIN
    _id := _tippgeber::uuid;
  EXCEPTION WHEN others THEN
    SELECT id INTO _id FROM public.tippgeber WHERE tg_slug = _tippgeber LIMIT 1;
  END;

  IF _id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.tippgeber
  SET meta = jsonb_set(
    jsonb_set(
      COALESCE(meta, '{}'::jsonb),
      '{klicks}',
      to_jsonb(COALESCE(NULLIF(meta->>'klicks',''), '0')::int + 1)
    ),
    '{letzter_klick}',
    to_jsonb(now()::text)
  )
  WHERE id = _id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_tippgeber_klick(text) TO anon, authenticated;