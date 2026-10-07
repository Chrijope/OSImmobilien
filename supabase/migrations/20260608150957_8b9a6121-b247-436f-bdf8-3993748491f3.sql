ALTER TABLE public.signature_requests
  ADD COLUMN IF NOT EXISTS email_opened_at timestamptz,
  ADD COLUMN IF NOT EXISTS link_opened_at  timestamptz;

CREATE OR REPLACE FUNCTION public.mark_signature_email_opened(_token text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.signature_requests
     SET email_opened_at = now()
   WHERE token = _token
     AND email_opened_at IS NULL;
$$;

CREATE OR REPLACE FUNCTION public.mark_signature_link_opened(_token text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.signature_requests
     SET link_opened_at = now()
   WHERE token = _token
     AND link_opened_at IS NULL;
$$;

GRANT EXECUTE ON FUNCTION public.mark_signature_email_opened(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_signature_link_opened(text)  TO anon, authenticated;