-- E10a: Trigger-Audit — fehlende Trigger nachziehen (rein additiv, keine Logikänderung)
-- Strategie: Nur Timestamp- und Notify-Trigger; KEIN harter Cascade-Delete (Soft-Delete bleibt Standard).

-- 1) BEFORE UPDATE: aktualisiert_am = now() für alle Tabellen mit dieser Spalte
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'academy_progress','app_config','aufgaben','chat_gruppen','externe_investments',
    'finanzierungen','hv_tickets','kontakte','news','objekt_einreichungen',
    'objekte','pipeline','rechnung_stammdaten','wissenswelt_feedback'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_set_aktualisiert_am ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER trg_set_aktualisiert_am BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.update_aktualisiert_am_column()',
      t
    );
  END LOOP;
END$$;

-- 2) Notify bei neuer Objekt-Einreichung (additiv)
DROP TRIGGER IF EXISTS trg_notify_admins_neue_einreichung ON public.objekt_einreichungen;
CREATE TRIGGER trg_notify_admins_neue_einreichung
AFTER INSERT ON public.objekt_einreichungen
FOR EACH ROW EXECUTE FUNCTION public.notify_admins_neue_einreichung();

-- 3) Academy-Progress Timestamp (additiv, ersetzt 1) für academy_progress)
DROP TRIGGER IF EXISTS trg_academy_progress_timestamp ON public.academy_progress;
CREATE TRIGGER trg_academy_progress_timestamp
BEFORE UPDATE ON public.academy_progress
FOR EACH ROW EXECUTE FUNCTION public.update_academy_progress_timestamp();

-- E10c: Audit-Log-Tabelle (rein additiv, kein bestehender Code liest/schreibt sie)
CREATE TABLE IF NOT EXISTS public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor uuid,
  actor_email text,
  action text NOT NULL,
  entity text NOT NULL,
  entity_id text,
  vorher jsonb,
  nachher jsonb,
  meta jsonb DEFAULT '{}'::jsonb,
  erstellt_am timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON public.audit_log (entity, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON public.audit_log (actor);
CREATE INDEX IF NOT EXISTS idx_audit_log_erstellt_am ON public.audit_log (erstellt_am DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON public.audit_log (action);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins sehen Audit-Log" ON public.audit_log;
CREATE POLICY "Admins sehen Audit-Log"
ON public.audit_log FOR SELECT TO authenticated
USING (public.is_admin_role(auth.uid()));

DROP POLICY IF EXISTS "Authentifizierte schreiben Audit-Log" ON public.audit_log;
CREATE POLICY "Authentifizierte schreiben Audit-Log"
ON public.audit_log FOR INSERT TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

-- Convenience-RPC
CREATE OR REPLACE FUNCTION public.log_audit(
  _action text,
  _entity text,
  _entity_id text DEFAULT NULL,
  _vorher jsonb DEFAULT NULL,
  _nachher jsonb DEFAULT NULL,
  _meta jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _id uuid;
BEGIN
  INSERT INTO public.audit_log (actor, action, entity, entity_id, vorher, nachher, meta)
  VALUES (auth.uid(), _action, _entity, _entity_id, _vorher, _nachher, COALESCE(_meta, '{}'::jsonb))
  RETURNING id INTO _id;
  RETURN _id;
END;
$$;