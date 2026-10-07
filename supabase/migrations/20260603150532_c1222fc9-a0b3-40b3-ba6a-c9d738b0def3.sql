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

-- Datenanweisung des Ursprungsprojekts entfernt (OSImmobilien)