
CREATE TABLE public.auth_lockouts (
  email TEXT PRIMARY KEY,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  first_failed_at TIMESTAMPTZ,
  last_failed_at TIMESTAMPTZ,
  locked_until TIMESTAMPTZ,
  lockout_count INTEGER NOT NULL DEFAULT 0,
  last_ip TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.auth_lockouts TO authenticated;
GRANT ALL ON public.auth_lockouts TO service_role;

ALTER TABLE public.auth_lockouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view lockouts"
  ON public.auth_lockouts
  FOR SELECT
  TO authenticated
  USING (public.is_admin_role(auth.uid()));

CREATE INDEX idx_auth_lockouts_locked_until ON public.auth_lockouts(locked_until) WHERE locked_until IS NOT NULL;

CREATE OR REPLACE FUNCTION public.check_auth_lockout(_email TEXT)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.auth_lockouts;
BEGIN
  SELECT * INTO _row FROM public.auth_lockouts WHERE email = lower(_email);
  IF NOT FOUND OR _row.locked_until IS NULL OR _row.locked_until < now() THEN
    RETURN jsonb_build_object('locked', false);
  END IF;
  RETURN jsonb_build_object(
    'locked', true,
    'locked_until', _row.locked_until,
    'retry_after_seconds', GREATEST(0, EXTRACT(EPOCH FROM (_row.locked_until - now()))::int),
    'lockout_count', _row.lockout_count
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.record_auth_attempt(
  _email TEXT,
  _success BOOLEAN,
  _ip TEXT DEFAULT NULL,
  _max_attempts INTEGER DEFAULT 5,
  _window_minutes INTEGER DEFAULT 15,
  _lockout_minutes INTEGER DEFAULT 15
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.auth_lockouts;
  _email_lc TEXT := lower(_email);
  _just_locked BOOLEAN := false;
  _new_attempts INTEGER;
  _new_locked_until TIMESTAMPTZ;
BEGIN
  SELECT * INTO _row FROM public.auth_lockouts WHERE email = _email_lc FOR UPDATE;

  IF _success THEN
    IF FOUND THEN
      UPDATE public.auth_lockouts
      SET failed_attempts = 0,
          first_failed_at = NULL,
          last_failed_at = NULL,
          locked_until = NULL,
          updated_at = now()
      WHERE email = _email_lc;
    END IF;
    RETURN jsonb_build_object('locked', false, 'just_locked', false);
  END IF;

  -- Failed attempt
  IF NOT FOUND THEN
    INSERT INTO public.auth_lockouts (email, failed_attempts, first_failed_at, last_failed_at, last_ip)
    VALUES (_email_lc, 1, now(), now(), _ip);
    RETURN jsonb_build_object(
      'locked', false, 'just_locked', false,
      'failed_attempts', 1, 'max_attempts', _max_attempts,
      'remaining', _max_attempts - 1
    );
  END IF;

  -- Reset counter if outside window OR already past lockout
  IF _row.first_failed_at IS NULL
     OR _row.first_failed_at < now() - (_window_minutes || ' minutes')::interval
     OR (_row.locked_until IS NOT NULL AND _row.locked_until < now()) THEN
    UPDATE public.auth_lockouts
    SET failed_attempts = 1,
        first_failed_at = now(),
        last_failed_at = now(),
        locked_until = NULL,
        last_ip = _ip,
        updated_at = now()
    WHERE email = _email_lc;
    RETURN jsonb_build_object(
      'locked', false, 'just_locked', false,
      'failed_attempts', 1, 'max_attempts', _max_attempts,
      'remaining', _max_attempts - 1
    );
  END IF;

  _new_attempts := _row.failed_attempts + 1;
  IF _new_attempts >= _max_attempts THEN
    _new_locked_until := now() + (_lockout_minutes || ' minutes')::interval;
    _just_locked := (_row.locked_until IS NULL OR _row.locked_until < now());
  ELSE
    _new_locked_until := _row.locked_until;
  END IF;

  UPDATE public.auth_lockouts
  SET failed_attempts = _new_attempts,
      last_failed_at = now(),
      locked_until = _new_locked_until,
      lockout_count = CASE WHEN _just_locked THEN lockout_count + 1 ELSE lockout_count END,
      last_ip = _ip,
      updated_at = now()
  WHERE email = _email_lc;

  RETURN jsonb_build_object(
    'locked', _new_locked_until IS NOT NULL AND _new_locked_until > now(),
    'just_locked', _just_locked,
    'failed_attempts', _new_attempts,
    'max_attempts', _max_attempts,
    'remaining', GREATEST(0, _max_attempts - _new_attempts),
    'locked_until', _new_locked_until,
    'lockout_count', _row.lockout_count + CASE WHEN _just_locked THEN 1 ELSE 0 END
  );
END;
$$;
