
-- ============================================================
-- Punkt 5: Deep-Merge für Kontakt-Meta
-- ============================================================
CREATE OR REPLACE FUNCTION public.merge_kontakt_meta(_kontakt_id uuid, _updates jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _result jsonb;
BEGIN
  UPDATE kontakte
  SET meta = public.jsonb_deep_merge(COALESCE(meta, '{}'::jsonb), COALESCE(_updates, '{}'::jsonb)),
      aktualisiert_am = now()
  WHERE id = _kontakt_id
  RETURNING meta INTO _result;

  RETURN COALESCE(_result, '{}'::jsonb);
END;
$$;

-- ============================================================
-- Punkt 7: Indizes auf häufig gefilterte JSONB-Felder
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_kontakte_meta_pipeline_stufe
  ON public.kontakte ((meta ->> 'pipelineStufe'));

CREATE INDEX IF NOT EXISTS idx_kontakte_meta_lead_quality
  ON public.kontakte ((meta ->> 'leadQuality'));

CREATE INDEX IF NOT EXISTS idx_kontakte_meta_archived
  ON public.kontakte ((meta ->> 'archived'))
  WHERE (meta ->> 'archived') IS NOT NULL;

-- ============================================================
-- Punkt 11: Audit-Log mit Verfallsdatum (Archiv-Tabelle + Cron)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.audit_log_archive (
  id uuid PRIMARY KEY,
  actor uuid,
  actor_email text,
  action text,
  entity text,
  entity_id text,
  vorher jsonb,
  nachher jsonb,
  meta jsonb,
  erstellt_am timestamptz NOT NULL,
  archived_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.audit_log_archive TO authenticated;
GRANT ALL ON public.audit_log_archive TO service_role;

ALTER TABLE public.audit_log_archive ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins koennen Audit-Archiv lesen" ON public.audit_log_archive;
CREATE POLICY "Admins koennen Audit-Archiv lesen"
ON public.audit_log_archive
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'inhaber'::app_role));

CREATE INDEX IF NOT EXISTS idx_audit_log_archive_erstellt_am
  ON public.audit_log_archive (erstellt_am DESC);

-- Rotation-Job: normale Einträge > 90 Tage ins Archiv,
-- kritische Aktionen (DSGVO/Rollen/Login-Failures) bleiben 365 Tage im Haupt-Log
CREATE OR REPLACE FUNCTION public.rotate_audit_log()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _archived int := 0;
  _purged int := 0;
  _critical_actions text[] := ARRAY[
    'dsgvo_delete','dsgvo_purge','dsgvo_anonymize',
    'role_change','role_added','role_removed',
    'login_failure','login_locked','password_changed',
    'mfa_enabled','mfa_disabled'
  ];
BEGIN
  -- 1) Normale Einträge älter als 90 Tage → Archiv
  WITH moved AS (
    DELETE FROM public.audit_log
    WHERE erstellt_am < now() - interval '90 days'
      AND NOT (action = ANY(_critical_actions))
    RETURNING id, actor, actor_email, action, entity, entity_id, vorher, nachher, meta, erstellt_am
  )
  INSERT INTO public.audit_log_archive
    (id, actor, actor_email, action, entity, entity_id, vorher, nachher, meta, erstellt_am)
  SELECT id, actor, actor_email, action, entity, entity_id, vorher, nachher, meta, erstellt_am
  FROM moved
  ON CONFLICT (id) DO NOTHING;

  GET DIAGNOSTICS _archived = ROW_COUNT;

  -- 2) Kritische Einträge älter als 365 Tage → Archiv (Compliance-Maximum)
  WITH moved AS (
    DELETE FROM public.audit_log
    WHERE erstellt_am < now() - interval '365 days'
      AND action = ANY(_critical_actions)
    RETURNING id, actor, actor_email, action, entity, entity_id, vorher, nachher, meta, erstellt_am
  )
  INSERT INTO public.audit_log_archive
    (id, actor, actor_email, action, entity, entity_id, vorher, nachher, meta, erstellt_am)
  SELECT id, actor, actor_email, action, entity, entity_id, vorher, nachher, meta, erstellt_am
  FROM moved
  ON CONFLICT (id) DO NOTHING;

  GET DIAGNOSTICS _purged = ROW_COUNT;

  RETURN jsonb_build_object(
    'archived_standard', _archived,
    'archived_critical', _purged,
    'ran_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rotate_audit_log() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rotate_audit_log() TO service_role;

-- ============================================================
-- Punkt 12: E-Mail-Sendelog Retention
-- ============================================================
CREATE OR REPLACE FUNCTION public.cleanup_email_send_log()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _success_deleted int := 0;
  _failure_deleted int := 0;
BEGIN
  DELETE FROM public.email_send_log
  WHERE created_at < now() - interval '14 days'
    AND status IN ('sent','delivered','queued','success');
  GET DIAGNOSTICS _success_deleted = ROW_COUNT;

  DELETE FROM public.email_send_log
  WHERE created_at < now() - interval '7 days'
    AND status IN ('failed','error','bounce','bounced','complaint');
  GET DIAGNOSTICS _failure_deleted = ROW_COUNT;

  RETURN jsonb_build_object(
    'success_deleted', _success_deleted,
    'failure_deleted', _failure_deleted,
    'ran_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_email_send_log() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_email_send_log() TO service_role;

-- ============================================================
-- Cron-Job: jede Nacht 03:15 UTC
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('rotate_audit_log_nightly')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'rotate_audit_log_nightly');

    PERFORM cron.unschedule('cleanup_email_send_log_nightly')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup_email_send_log_nightly');

    PERFORM cron.schedule(
      'rotate_audit_log_nightly',
      '15 3 * * *',
      $cron$ SELECT public.rotate_audit_log(); $cron$
    );

    PERFORM cron.schedule(
      'cleanup_email_send_log_nightly',
      '30 3 * * *',
      $cron$ SELECT public.cleanup_email_send_log(); $cron$
    );
  END IF;
END;
$$;
