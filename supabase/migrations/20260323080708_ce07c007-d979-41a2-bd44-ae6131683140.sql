
CREATE OR REPLACE FUNCTION public.merge_kontakt_meta(_kontakt_id uuid, _updates jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _result jsonb;
BEGIN
  UPDATE kontakte
  SET meta = COALESCE(meta, '{}'::jsonb) || _updates,
      aktualisiert_am = now()
  WHERE id = _kontakt_id
  RETURNING meta INTO _result;
  
  RETURN COALESCE(_result, '{}'::jsonb);
END;
$$;
