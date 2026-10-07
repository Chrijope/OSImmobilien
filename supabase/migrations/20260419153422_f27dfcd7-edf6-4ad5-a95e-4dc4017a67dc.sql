CREATE OR REPLACE FUNCTION public.confirm_notar_termin(
  _investment_id uuid,
  _datum text,
  _uhrzeit text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  inv_row public.investments%ROWTYPE;
  kontakt_row public.kontakte%ROWTYPE;
  current_meta jsonb;
  current_notar_data jsonb;
  bestaetigt jsonb;
BEGIN
  SELECT * INTO inv_row FROM public.investments WHERE id = _investment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Investment not found';
  END IF;

  SELECT * INTO kontakt_row FROM public.kontakte WHERE id::text = inv_row.kunde_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kontakt not found';
  END IF;

  -- Allow internal roles OR the linked customer (Person 1 or Person 2)
  IF NOT (
    public.is_internal_role(auth.uid())
    OR (kontakt_row.meta ->> 'authUserId') = auth.uid()::text
    OR ((kontakt_row.meta -> 'person2') ->> 'authUserId') = auth.uid()::text
  ) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  current_meta := COALESCE(inv_row.meta, '{}'::jsonb);
  current_notar_data := COALESCE(current_meta -> 'notarData', '{}'::jsonb);
  current_notar_data := jsonb_set(current_notar_data, '{datum}', to_jsonb(_datum), true);
  current_notar_data := jsonb_set(current_notar_data, '{uhrzeit}', to_jsonb(_uhrzeit), true);

  bestaetigt := jsonb_build_object(
    'datum', _datum,
    'uhrzeit', _uhrzeit,
    'bestaetigtAm', to_jsonb(now())
  );

  current_meta := current_meta
    || jsonb_build_object(
      'notarData', current_notar_data,
      'notarTermin', _datum,
      'notarUhrzeit', _uhrzeit,
      'notarTerminBestaetigt', bestaetigt,
      'notarTerminPortalFreigabe', true
    );

  UPDATE public.investments SET meta = current_meta WHERE id = _investment_id;

  RETURN current_meta;
END;
$$;