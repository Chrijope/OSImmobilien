CREATE OR REPLACE FUNCTION public.register_unterlage_upload(
  _investment_id uuid,
  _doc_name text,
  _file_url text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv_row public.investments%ROWTYPE;
  kontakt_row public.kontakte%ROWTYPE;
  current_meta jsonb;
  current_statuses jsonb;
  current_urls jsonb;
BEGIN
  SELECT * INTO inv_row
  FROM public.investments
  WHERE id = _investment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Investment not found';
  END IF;

  SELECT * INTO kontakt_row
  FROM public.kontakte
  WHERE id::text = inv_row.kunde_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kontakt not found';
  END IF;

  IF NOT (
    public.is_internal_role(auth.uid())
    OR (kontakt_row.meta ->> 'authUserId') = auth.uid()::text
  ) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  current_meta := COALESCE(inv_row.meta, '{}'::jsonb);
  current_statuses := COALESCE(current_meta -> 'docStatuses', '{}'::jsonb);
  current_urls := COALESCE(current_meta -> 'docFileUrls', '{}'::jsonb);

  current_statuses := jsonb_set(current_statuses, ARRAY[_doc_name], to_jsonb('uploaded'::text), true);
  current_urls := jsonb_set(current_urls, ARRAY[_doc_name], to_jsonb(_file_url), true);
  current_meta := jsonb_set(current_meta, '{docStatuses}', current_statuses, true);
  current_meta := jsonb_set(current_meta, '{docFileUrls}', current_urls, true);

  UPDATE public.investments
  SET meta = current_meta
  WHERE id = _investment_id;

  RETURN current_meta;
END;
$$;