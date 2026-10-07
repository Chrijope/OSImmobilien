-- 1) Tabelle für gehashte Einmal-Recovery-Codes
CREATE TABLE IF NOT EXISTS public.mfa_recovery_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  code_hash TEXT NOT NULL,
  used_at TIMESTAMPTZ,
  used_ip TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mfa_recovery_codes_user ON public.mfa_recovery_codes(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_mfa_recovery_codes_hash ON public.mfa_recovery_codes(code_hash);

GRANT SELECT ON public.mfa_recovery_codes TO authenticated;
GRANT ALL ON public.mfa_recovery_codes TO service_role;

ALTER TABLE public.mfa_recovery_codes ENABLE ROW LEVEL SECURITY;

-- Nutzer sieht ausschließlich Status seiner eigenen Codes (Klartext steckt nicht in der Tabelle)
CREATE POLICY "users_view_own_recovery_codes"
  ON public.mfa_recovery_codes
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Schreibzugriff: nur Service Role (über Edge Function)
-- Keine INSERT/UPDATE/DELETE-Policy für authenticated → bleibt verboten.

-- 2) Verbrauchsfunktion (SECURITY DEFINER): markiert ersten passenden, ungenutzten Code als verbraucht
CREATE OR REPLACE FUNCTION public.consume_mfa_recovery_code(_user_id UUID, _code_hash TEXT, _ip TEXT DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row_id UUID;
BEGIN
  UPDATE public.mfa_recovery_codes
  SET used_at = now(), used_ip = _ip
  WHERE user_id = _user_id
    AND code_hash = _code_hash
    AND used_at IS NULL
  RETURNING id INTO _row_id;

  IF _row_id IS NULL THEN
    RETURN false;
  END IF;

  INSERT INTO public.audit_log (actor, action, entity, entity_id, meta)
  VALUES (_user_id, 'mfa_recovery_code_used', 'mfa_recovery_codes', _row_id::text,
          jsonb_build_object('ip', _ip));

  RETURN true;
END;
$$;

-- 3) Status-Funktion: nur Counts, niemals Klartext oder Hash
CREATE OR REPLACE FUNCTION public.mfa_recovery_codes_status(_user_id UUID)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'total', COUNT(*),
    'used', COUNT(*) FILTER (WHERE used_at IS NOT NULL),
    'remaining', COUNT(*) FILTER (WHERE used_at IS NULL),
    'last_generated_at', MAX(created_at)
  )
  FROM public.mfa_recovery_codes
  WHERE user_id = _user_id;
$$;