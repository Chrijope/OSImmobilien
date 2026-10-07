-- Step 4: Lock down mobile_scan_sessions, expose token-gated RPCs

-- 1) Drop permissive anon policies (keep internal-role policies intact)
DROP POLICY IF EXISTS "Mobile scan read via token" ON public.mobile_scan_sessions;
DROP POLICY IF EXISTS "Mobile scan update via token" ON public.mobile_scan_sessions;
DROP POLICY IF EXISTS "Anyone can read mobile scan session by token" ON public.mobile_scan_sessions;
DROP POLICY IF EXISTS "Anyone can update mobile scan session by token" ON public.mobile_scan_sessions;

-- 2) RPC: read a session by token (anon allowed, but only with valid non-expired token)
CREATE OR REPLACE FUNCTION public.get_mobile_scan_session(_token text)
RETURNS public.mobile_scan_sessions
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM public.mobile_scan_sessions
  WHERE token = _token
    AND expires_at > now()
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.get_mobile_scan_session(text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_mobile_scan_session(text) TO anon, authenticated;

-- 3) RPC: append upload / update status by token
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
      last_upload_at = COALESCE(_last_upload_at, last_upload_at)
  WHERE id = _row.id
  RETURNING * INTO _row;

  RETURN _row;
END;
$$;

REVOKE ALL ON FUNCTION public.update_mobile_scan_session(text, jsonb, text, text, timestamptz) FROM public;
GRANT EXECUTE ON FUNCTION public.update_mobile_scan_session(text, jsonb, text, text, timestamptz) TO anon, authenticated;