-- ════════════════════════════════════════════════════════════════════
-- P0 Security Hardening: Academy progress integrity
-- ════════════════════════════════════════════════════════════════════
-- Schützt die "Bestanden"- und Zertifikats-Spalten vor Selbst-Manipulation
-- durch normale Nutzer. Verhindert außerdem das Zurücksetzen der
-- quiz_attempts (5-Fail/24h-Sperre kann so nicht ausgehebelt werden) und
-- das Ändern der hinterlegten Rolle/User-ID nach Anlage.
--
-- Admins/Inhaber bleiben uneingeschränkt schreibberechtigt.

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
  -- Admins/Inhaber dürfen alles
  _is_admin := public.is_admin_role(auth.uid());
  IF _is_admin THEN
    RETURN NEW;
  END IF;

  -- user_id und role sind nach Anlage unveränderlich für normale Nutzer
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'academy_progress.user_id kann nicht geändert werden';
  END IF;
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'academy_progress.role kann nur von Admins geändert werden';
  END IF;

  -- Bestanden-Status & Zertifikat dürfen nur Admins oder Server-Code
  -- (security definer Functions) setzen. Aus dem normalen Client-UPDATE
  -- werden Änderungen an diesen Feldern blockiert.
  IF NEW.passed_at IS DISTINCT FROM OLD.passed_at
     OR NEW.passed_score IS DISTINCT FROM OLD.passed_score
     OR NEW.certificate_serial IS DISTINCT FROM OLD.certificate_serial
     OR NEW.certificate_pdf_url IS DISTINCT FROM OLD.certificate_pdf_url
     OR NEW.certificate_issued_at IS DISTINCT FROM OLD.certificate_issued_at THEN
    RAISE EXCEPTION 'Bestanden-/Zertifikatsfelder können nicht direkt durch Nutzer geändert werden';
  END IF;

  -- quiz_attempts darf nur wachsen (Append-only) — verhindert das
  -- Zurücksetzen der 5-Versuche/24h-Sperre durch den Client.
  _old_attempts_len := jsonb_array_length(COALESCE(OLD.quiz_attempts, '[]'::jsonb));
  _new_attempts_len := jsonb_array_length(COALESCE(NEW.quiz_attempts, '[]'::jsonb));
  IF _new_attempts_len < _old_attempts_len THEN
    RAISE EXCEPTION 'quiz_attempts dürfen nicht reduziert werden';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_academy_progress_guard ON public.academy_progress;
CREATE TRIGGER trg_academy_progress_guard
BEFORE UPDATE ON public.academy_progress
FOR EACH ROW
EXECUTE FUNCTION public.academy_progress_guard();

-- Auch beim INSERT: passed_*/certificate_* nicht durch Nutzer setzen lassen
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

  -- Bestanden-/Zertifikatsfelder müssen beim Insert leer sein
  NEW.passed_at := NULL;
  NEW.passed_score := NULL;
  NEW.certificate_serial := NULL;
  NEW.certificate_pdf_url := NULL;
  NEW.certificate_issued_at := NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_academy_progress_insert_guard ON public.academy_progress;
CREATE TRIGGER trg_academy_progress_insert_guard
BEFORE INSERT ON public.academy_progress
FOR EACH ROW
EXECUTE FUNCTION public.academy_progress_insert_guard();