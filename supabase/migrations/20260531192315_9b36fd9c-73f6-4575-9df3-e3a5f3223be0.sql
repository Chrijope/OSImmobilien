-- 1) Secret-Rotations-Tracking
CREATE TABLE public.secret_rotations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  secret_name TEXT NOT NULL UNIQUE,
  last_rotated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  rotated_by UUID,
  rotated_by_name TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.secret_rotations TO authenticated;
GRANT ALL ON public.secret_rotations TO service_role;

ALTER TABLE public.secret_rotations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins können Rotationen sehen"
ON public.secret_rotations FOR SELECT TO authenticated
USING (public.is_admin_role(auth.uid()));

CREATE POLICY "Admins können Rotationen anlegen"
ON public.secret_rotations FOR INSERT TO authenticated
WITH CHECK (public.is_admin_role(auth.uid()));

CREATE POLICY "Admins können Rotationen aktualisieren"
ON public.secret_rotations FOR UPDATE TO authenticated
USING (public.is_admin_role(auth.uid()));

CREATE POLICY "Admins können Rotationen löschen"
ON public.secret_rotations FOR DELETE TO authenticated
USING (public.is_admin_role(auth.uid()));

-- 2) Audit-Anomalie-Erkennung
CREATE OR REPLACE FUNCTION public.detect_audit_anomalies()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _mass_deletes jsonb;
  _role_changes jsonb;
  _login_failures jsonb;
  _dsgvo_deletes jsonb;
BEGIN
  IF NOT public.is_admin_role(auth.uid()) THEN
    RAISE EXCEPTION 'Nur Admin oder Inhaber';
  END IF;

  -- Massen-Löschungen (>10 Deletes in 1h durch denselben Actor)
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO _mass_deletes FROM (
    SELECT
      actor,
      actor_email,
      entity,
      COUNT(*)::int AS anzahl,
      MIN(erstellt_am) AS von,
      MAX(erstellt_am) AS bis
    FROM public.audit_log
    WHERE action ILIKE '%delete%' OR action ILIKE '%loesch%' OR action ILIKE '%purge%'
    AND erstellt_am > now() - interval '24 hours'
    GROUP BY actor, actor_email, entity
    HAVING COUNT(*) > 10
    ORDER BY anzahl DESC
    LIMIT 20
  ) t;

  -- Rollen-Änderungen
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO _role_changes FROM (
    SELECT id, actor, actor_email, action, entity_id, meta, erstellt_am
    FROM public.audit_log
    WHERE (entity = 'user_roles' OR action ILIKE '%role%')
      AND erstellt_am > now() - interval '24 hours'
    ORDER BY erstellt_am DESC
    LIMIT 50
  ) t;

  -- Fehlgeschlagene Logins (aus auth_lockouts mit recent failed attempts)
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO _login_failures FROM (
    SELECT email, failed_attempts, locked_until, lockout_count, last_failed_at, last_ip
    FROM public.auth_lockouts
    WHERE last_failed_at > now() - interval '24 hours'
      AND failed_attempts >= 3
    ORDER BY last_failed_at DESC
    LIMIT 30
  ) t;

  -- DSGVO-Hard-Deletes (immer kritisch zu prüfen)
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO _dsgvo_deletes FROM (
    SELECT id, actor, actor_email, entity_id, meta, erstellt_am
    FROM public.audit_log
    WHERE action = 'dsgvo_hard_delete'
      AND erstellt_am > now() - interval '7 days'
    ORDER BY erstellt_am DESC
    LIMIT 30
  ) t;

  RETURN jsonb_build_object(
    'mass_deletes', _mass_deletes,
    'role_changes', _role_changes,
    'login_failures', _login_failures,
    'dsgvo_deletes', _dsgvo_deletes,
    'scanned_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.detect_audit_anomalies() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.detect_audit_anomalies() TO authenticated;

-- 3) DB-Security-Selfcheck
CREATE OR REPLACE FUNCTION public.run_security_self_check()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _rls_off jsonb;
  _definer_no_search_path jsonb;
  _public_tables_no_policy jsonb;
BEGIN
  IF NOT public.is_admin_role(auth.uid()) THEN
    RAISE EXCEPTION 'Nur Admin oder Inhaber';
  END IF;

  -- Tabellen im public-Schema ohne RLS
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO _rls_off FROM (
    SELECT c.relname AS tabelle, n.nspname AS schema
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'r'
      AND n.nspname = 'public'
      AND NOT c.relrowsecurity
    ORDER BY c.relname
  ) t;

  -- SECURITY DEFINER Funktionen ohne fixierten search_path
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO _definer_no_search_path FROM (
    SELECT
      n.nspname AS schema,
      p.proname AS funktion,
      pg_get_function_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
      AND NOT EXISTS (
        SELECT 1 FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) AS cfg
        WHERE cfg LIKE 'search_path=%'
      )
    ORDER BY p.proname
  ) t;

  -- RLS-aktive Tabellen ohne Policy
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO _public_tables_no_policy FROM (
    SELECT c.relname AS tabelle
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'r'
      AND n.nspname = 'public'
      AND c.relrowsecurity
      AND NOT EXISTS (
        SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid
      )
    ORDER BY c.relname
  ) t;

  RETURN jsonb_build_object(
    'rls_disabled', _rls_off,
    'definer_no_search_path', _definer_no_search_path,
    'rls_no_policy', _public_tables_no_policy,
    'scanned_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.run_security_self_check() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.run_security_self_check() TO authenticated;