CREATE OR REPLACE FUNCTION public.update_mobile_scan_session(
  _token text,
  _meta jsonb DEFAULT NULL,
  _status text DEFAULT NULL,
  _last_doc_typ text DEFAULT NULL,
  _last_upload_at timestamptz DEFAULT NULL
)
RETURNS public.mobile_scan_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.mobile_scan_sessions;
  _current_inv_meta jsonb;
  _doc_file_url text;
  _uploads jsonb;
BEGIN
  SELECT * INTO _row
  FROM public.mobile_scan_sessions
  WHERE token = _token
    AND expires_at > now()
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid or expired token';
  END IF;

  UPDATE public.mobile_scan_sessions
  SET meta = COALESCE(_meta, meta),
      status = COALESCE(_status, status),
      last_doc_typ = COALESCE(_last_doc_typ, last_doc_typ),
      last_upload_at = COALESCE(_last_upload_at, last_upload_at),
      updated_at = now()
  WHERE id = _row.id
  RETURNING * INTO _row;

  IF _row.investment_id IS NOT NULL AND _last_doc_typ IS NOT NULL AND _last_doc_typ <> '' THEN
    _uploads := COALESCE(_row.meta -> 'uploads', '[]'::jsonb);

    SELECT upload_item ->> 'fileUrl'
    INTO _doc_file_url
    FROM jsonb_array_elements(_uploads) AS upload_item
    WHERE upload_item ->> 'docTyp' = _last_doc_typ
      AND COALESCE(upload_item ->> 'fileUrl', '') <> ''
    ORDER BY COALESCE(upload_item ->> 'at', '') DESC
    LIMIT 1;

    IF COALESCE(_doc_file_url, '') <> '' THEN
      SELECT COALESCE(meta, '{}'::jsonb)
      INTO _current_inv_meta
      FROM public.investments
      WHERE id = _row.investment_id
      FOR UPDATE;

      IF FOUND THEN
        _current_inv_meta := jsonb_set(
          _current_inv_meta,
          ARRAY['docStatuses', _last_doc_typ],
          to_jsonb('uploaded'::text),
          true
        );
        _current_inv_meta := jsonb_set(
          _current_inv_meta,
          ARRAY['docFileUrls', _last_doc_typ],
          to_jsonb(_doc_file_url),
          true
        );

        UPDATE public.investments
        SET meta = _current_inv_meta
        WHERE id = _row.investment_id;
      END IF;
    END IF;
  END IF;

  RETURN _row;
END;
$$;

REVOKE ALL ON FUNCTION public.update_mobile_scan_session(text, jsonb, text, text, timestamptz) FROM public;
GRANT EXECUTE ON FUNCTION public.update_mobile_scan_session(text, jsonb, text, text, timestamptz) TO anon, authenticated;