DO $$
DECLARE
  inv_record record;
  upload_record record;
  current_meta jsonb;
  current_statuses jsonb;
  current_urls jsonb;
BEGIN
  FOR inv_record IN
    SELECT DISTINCT investment_id
    FROM public.mobile_scan_sessions
    WHERE investment_id IS NOT NULL
      AND jsonb_typeof(COALESCE(meta -> 'uploads', '[]'::jsonb)) = 'array'
      AND jsonb_array_length(COALESCE(meta -> 'uploads', '[]'::jsonb)) > 0
  LOOP
    SELECT COALESCE(meta, '{}'::jsonb)
    INTO current_meta
    FROM public.investments
    WHERE id = inv_record.investment_id
    FOR UPDATE;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    current_statuses := COALESCE(current_meta -> 'docStatuses', '{}'::jsonb);
    current_urls := COALESCE(current_meta -> 'docFileUrls', '{}'::jsonb);

    FOR upload_record IN
      SELECT DISTINCT ON (upload_item ->> 'docTyp')
        upload_item ->> 'docTyp' AS doc_typ,
        upload_item ->> 'fileUrl' AS file_url
      FROM public.mobile_scan_sessions s
      CROSS JOIN LATERAL jsonb_array_elements(COALESCE(s.meta -> 'uploads', '[]'::jsonb)) AS upload_item
      WHERE s.investment_id = inv_record.investment_id
        AND COALESCE(upload_item ->> 'docTyp', '') <> ''
        AND COALESCE(upload_item ->> 'fileUrl', '') <> ''
      ORDER BY upload_item ->> 'docTyp', COALESCE(upload_item ->> 'at', '') DESC
    LOOP
      IF COALESCE(current_statuses ->> upload_record.doc_typ, 'none') <> 'approved' THEN
        current_statuses := jsonb_set(
          current_statuses,
          ARRAY[upload_record.doc_typ],
          to_jsonb('uploaded'::text),
          true
        );
      END IF;

      current_urls := jsonb_set(
        current_urls,
        ARRAY[upload_record.doc_typ],
        to_jsonb(upload_record.file_url),
        true
      );
    END LOOP;

    current_meta := jsonb_set(current_meta, '{docStatuses}', current_statuses, true);
    current_meta := jsonb_set(current_meta, '{docFileUrls}', current_urls, true);

    UPDATE public.investments
    SET meta = current_meta
    WHERE id = inv_record.investment_id;
  END LOOP;
END;
$$;