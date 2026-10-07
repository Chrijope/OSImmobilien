
CREATE TABLE public.activation_tokens (
  token uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  email text NOT NULL,
  kontakt_id uuid,
  portal text,
  kunde_name text,
  next text,
  role text,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  used_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_activation_tokens_user_id ON public.activation_tokens(user_id);
CREATE INDEX idx_activation_tokens_email ON public.activation_tokens(email);

GRANT ALL ON public.activation_tokens TO service_role;

ALTER TABLE public.activation_tokens ENABLE ROW LEVEL SECURITY;

-- Keine Policies: Tabelle ist nur über SECURITY DEFINER RPCs und service_role
-- (Edge Functions) erreichbar. Anonyme Aktivierungs-Lookups laufen über
-- get_activation_token().

CREATE OR REPLACE FUNCTION public.get_activation_token(_token uuid)
RETURNS TABLE(
  token uuid,
  email text,
  kontakt_id uuid,
  portal text,
  kunde_name text,
  next text,
  role text,
  expires_at timestamptz,
  used boolean,
  expired boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    t.token,
    t.email,
    t.kontakt_id,
    t.portal,
    t.kunde_name,
    t.next,
    t.role,
    t.expires_at,
    (t.used_at IS NOT NULL) AS used,
    (t.expires_at <= now()) AS expired
  FROM public.activation_tokens t
  WHERE t.token = _token
  LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.get_activation_token(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.consume_activation_token(_token uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id uuid;
BEGIN
  UPDATE public.activation_tokens
  SET used_at = now()
  WHERE token = _token
    AND used_at IS NULL
    AND expires_at > now()
  RETURNING user_id INTO _user_id;

  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Aktivierungs-Token ist ungültig, abgelaufen oder bereits verwendet';
  END IF;

  RETURN _user_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.consume_activation_token(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_activation_token(uuid) TO service_role;

-- Cleanup: alte abgelaufene Tokens nach 30 Tagen löschen
CREATE OR REPLACE FUNCTION public.cleanup_activation_tokens()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE deleted_count bigint;
BEGIN
  DELETE FROM public.activation_tokens
  WHERE expires_at < now() - interval '30 days';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;
