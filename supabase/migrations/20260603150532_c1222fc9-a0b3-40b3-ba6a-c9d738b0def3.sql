CREATE OR REPLACE FUNCTION public.academy_progress_insert_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF public.is_admin_role(auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF current_setting('app.academy_progress_trusted_write', true) = 'on' THEN
    RETURN NEW;
  END IF;

  NEW.passed_at := NULL;
  NEW.passed_score := NULL;
  NEW.certificate_serial := NULL;
  NEW.certificate_pdf_url := NULL;
  NEW.certificate_issued_at := NULL;
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  _user_id uuid;
  _role text;
  _serial text;
  _chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  _random text := '';
  _i int;
BEGIN
  SELECT p.id, COALESCE(ur.role, 'vertriebspartner') INTO _user_id, _role
  FROM public.profiles p
  LEFT JOIN public.user_roles ur ON ur.user_id = p.id
  WHERE lower(p.name) LIKE '%stefan%hrubesch%' OR lower(p.email) LIKE '%hrubesch%'
  ORDER BY p.updated_at DESC
  LIMIT 1;

  IF _user_id IS NOT NULL THEN
    SELECT certificate_serial INTO _serial
    FROM public.academy_progress
    WHERE user_id = _user_id;

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
    SET passed_at = COALESCE(passed_at, now()),
        passed_score = GREATEST(COALESCE(passed_score, 0), 100),
        certificate_serial = _serial,
        certificate_issued_at = COALESCE(certificate_issued_at, now())
    WHERE user_id = _user_id;
  END IF;
END;
$$;