
-- 1. sa_fill_tokens: anon UPDATE-Policy entfernen, durch token-geprüfte RPC ersetzen
DROP POLICY IF EXISTS "Anon can mark token used" ON public.sa_fill_tokens;

CREATE OR REPLACE FUNCTION public.mark_sa_fill_token_used(_token text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _updated integer;
BEGIN
  UPDATE public.sa_fill_tokens
  SET status = 'used'
  WHERE token = _token
    AND status = 'pending'
    AND expires_at > now();
  GET DIAGNOSTICS _updated = ROW_COUNT;
  RETURN _updated > 0;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_sa_fill_token_used(text) TO anon, authenticated;

-- 2. bewerbungen: öffentliches Karriere-Formular soll wie vorgesehen anon erlauben
DROP POLICY IF EXISTS "Alle erstellen Bewerbungen" ON public.bewerbungen;

CREATE POLICY "Alle erstellen Bewerbungen"
ON public.bewerbungen
FOR INSERT
TO anon, authenticated
WITH CHECK (true);
