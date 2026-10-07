CREATE OR REPLACE FUNCTION public.get_mobile_scan_uploaded_docs(_token text)
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv_id uuid;
  v_meta jsonb;
  v_docs text[] := ARRAY[]::text[];
BEGIN
  SELECT investment_id INTO v_inv_id
  FROM public.mobile_scan_sessions
  WHERE token = _token
    AND expires_at > now();

  IF v_inv_id IS NULL THEN
    RETURN v_docs;
  END IF;

  SELECT meta INTO v_meta FROM public.investments WHERE id = v_inv_id;
  IF v_meta IS NULL THEN
    RETURN v_docs;
  END IF;

  -- Sammle alle docTypen, deren Status "uploaded" oder "approved" ist
  SELECT COALESCE(array_agg(key), ARRAY[]::text[]) INTO v_docs
  FROM jsonb_each_text(COALESCE(v_meta->'docStatuses', '{}'::jsonb))
  WHERE value IN ('uploaded', 'approved');

  -- Ergänze um docTypen, für die nur eine fileUrl gespeichert ist
  SELECT array(
    SELECT DISTINCT k FROM (
      SELECT unnest(v_docs) AS k
      UNION
      SELECT key FROM jsonb_each_text(COALESCE(v_meta->'docFileUrls', '{}'::jsonb))
        WHERE value IS NOT NULL AND value <> ''
    ) s
  ) INTO v_docs;

  RETURN v_docs;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_mobile_scan_uploaded_docs(text) TO anon, authenticated;