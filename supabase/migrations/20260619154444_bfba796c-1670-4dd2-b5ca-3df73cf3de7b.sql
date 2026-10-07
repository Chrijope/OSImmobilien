CREATE OR REPLACE FUNCTION public.academy_progress_prevent_passed_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.passed_at IS NOT NULL AND COALESCE(OLD.passed_score, 0) >= 75 THEN
    RAISE EXCEPTION 'Bestandene Academy-Abschlüsse können nicht gelöscht werden';
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_academy_progress_prevent_passed_delete ON public.academy_progress;
CREATE TRIGGER trg_academy_progress_prevent_passed_delete
BEFORE DELETE ON public.academy_progress
FOR EACH ROW
EXECUTE FUNCTION public.academy_progress_prevent_passed_delete();

REVOKE ALL ON FUNCTION public.academy_progress_permanent_pass_guard() FROM anon, public, authenticated;
REVOKE ALL ON FUNCTION public.academy_progress_prevent_passed_delete() FROM anon, public, authenticated;