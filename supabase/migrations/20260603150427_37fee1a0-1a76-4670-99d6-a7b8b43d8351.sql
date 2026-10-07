CREATE OR REPLACE FUNCTION public.academy_progress_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _is_admin boolean;
  _old_attempts_len int;
  _new_attempts_len int;
BEGIN
  _is_admin := public.is_admin_role(auth.uid());
  IF _is_admin THEN
    RETURN NEW;
  END IF;

  IF current_setting('app.academy_progress_trusted_write', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'academy_progress.user_id kann nicht geändert werden';
  END IF;
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'academy_progress.role kann nur von Admins geändert werden';
  END IF;

  IF NEW.passed_at IS DISTINCT FROM OLD.passed_at
     OR NEW.passed_score IS DISTINCT FROM OLD.passed_score
     OR NEW.certificate_serial IS DISTINCT FROM OLD.certificate_serial
     OR NEW.certificate_pdf_url IS DISTINCT FROM OLD.certificate_pdf_url
     OR NEW.certificate_issued_at IS DISTINCT FROM OLD.certificate_issued_at THEN
    RAISE EXCEPTION 'Bestanden-/Zertifikatsfelder können nicht direkt durch Nutzer geändert werden';
  END IF;

  _old_attempts_len := jsonb_array_length(COALESCE(OLD.quiz_attempts, '[]'::jsonb));
  _new_attempts_len := jsonb_array_length(COALESCE(NEW.quiz_attempts, '[]'::jsonb));
  IF _new_attempts_len < _old_attempts_len THEN
    RAISE EXCEPTION 'quiz_attempts dürfen nicht reduziert werden';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_academy_quiz_attempt(
  _user_id uuid,
  _role text,
  _attempt jsonb
)
RETURNS public.academy_progress
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _score int;
  _passed boolean;
  _attempted_at timestamptz;
  _progress public.academy_progress%ROWTYPE;
  _serial text;
  _chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  _random text := '';
  _i int;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> _user_id THEN
    RAISE EXCEPTION 'Nur der eigene Academy-Abschluss kann gespeichert werden';
  END IF;

  _score := COALESCE((_attempt->>'score_percent')::int, -1);
  _passed := COALESCE((_attempt->>'passed')::boolean, false);
  _attempted_at := COALESCE(NULLIF(_attempt->>'attempted_at', '')::timestamptz, now());

  IF _score < 75 OR _score > 100 OR NOT _passed THEN
    RAISE EXCEPTION 'Academy-Abschluss wurde nicht bestanden';
  END IF;

  INSERT INTO public.academy_progress (user_id, role, current_module_index, completed_modules, quiz_attempts)
  VALUES (_user_id, _role, 0, '[]'::jsonb, '[]'::jsonb)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO _progress
  FROM public.academy_progress
  WHERE user_id = _user_id
  FOR UPDATE;

  _serial := _progress.certificate_serial;
  IF _serial IS NULL THEN
    LOOP
      _random := '';
      FOR _i IN 1..6 LOOP
        _random := _random || substr(_chars, 1 + floor(random() * length(_chars))::int, 1);
      END LOOP;
      _serial := 'MI-' || upper(substr(_role, 1, 3)) || '-' || to_char(now(), 'YYYY-MM') || '-' || _random;
      EXIT WHEN NOT EXISTS (
        SELECT 1 FROM public.academy_progress WHERE certificate_serial = _serial
      );
    END LOOP;
  END IF;

  PERFORM set_config('app.academy_progress_trusted_write', 'on', true);

  UPDATE public.academy_progress
  SET quiz_attempts = COALESCE(_progress.quiz_attempts, '[]'::jsonb) || jsonb_build_array(_attempt),
      passed_at = COALESCE(_progress.passed_at, _attempted_at),
      passed_score = GREATEST(COALESCE(_progress.passed_score, 0), _score),
      certificate_serial = _serial,
      certificate_issued_at = COALESCE(_progress.certificate_issued_at, _attempted_at)
  WHERE user_id = _user_id
  RETURNING * INTO _progress;

  RETURN _progress;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_academy_quiz_attempt(uuid, text, jsonb) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.complete_academy_quiz_attempt(uuid, text, jsonb) TO authenticated;

-- Datenanweisung des Ursprungsprojekts entfernt (OSImmobilien)