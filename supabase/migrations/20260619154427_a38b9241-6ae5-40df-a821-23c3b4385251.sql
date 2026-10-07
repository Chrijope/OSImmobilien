CREATE OR REPLACE FUNCTION public.academy_progress_permanent_pass_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.passed_at IS NOT NULL AND COALESCE(OLD.passed_score, 0) >= 75 THEN
    NEW.passed_at := OLD.passed_at;
    NEW.passed_score := GREATEST(COALESCE(OLD.passed_score, 75), COALESCE(NEW.passed_score, 75));
    NEW.certificate_serial := COALESCE(OLD.certificate_serial, NEW.certificate_serial);
    NEW.certificate_issued_at := COALESCE(OLD.certificate_issued_at, NEW.certificate_issued_at, OLD.passed_at);
    NEW.certificate_pdf_url := COALESCE(OLD.certificate_pdf_url, NEW.certificate_pdf_url);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS aaa_academy_progress_permanent_pass_guard ON public.academy_progress;
CREATE TRIGGER aaa_academy_progress_permanent_pass_guard
BEFORE UPDATE ON public.academy_progress
FOR EACH ROW
EXECUTE FUNCTION public.academy_progress_permanent_pass_guard();

SELECT set_config('app.academy_progress_trusted_write', 'on', true);

UPDATE public.academy_progress
SET passed_score = GREATEST(COALESCE(passed_score, 75), 75),
    certificate_issued_at = COALESCE(certificate_issued_at, passed_at),
    aktualisiert_am = now()
WHERE passed_at IS NOT NULL
  AND COALESCE(passed_score, 0) >= 75;