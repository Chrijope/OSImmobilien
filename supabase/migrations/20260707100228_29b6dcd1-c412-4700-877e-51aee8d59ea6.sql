
-- ═════════════════════════════════════════════════════════════════════════════
-- Phase 1: Zentrales Audit-Log für lückenlose Aktivitätsdokumentation
-- ═════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kontakt_id uuid NOT NULL,
  actor_id uuid,
  actor_name text,
  actor_role text,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  changes jsonb DEFAULT '{}'::jsonb,
  meta jsonb DEFAULT '{}'::jsonb,
  source text NOT NULL DEFAULT 'trigger',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_log_kontakt ON public.activity_log(kontakt_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_actor ON public.activity_log(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_action ON public.activity_log(action, created_at DESC);

GRANT SELECT, INSERT ON public.activity_log TO authenticated;
GRANT ALL ON public.activity_log TO service_role;

ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "activity_log_select_visible"
ON public.activity_log FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'inhaber'::app_role)
  OR actor_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.kontakte k
    WHERE k.id = activity_log.kontakt_id
      AND k.zustaendig_id = auth.uid()
  )
);

CREATE POLICY "activity_log_insert_own"
ON public.activity_log FOR INSERT
TO authenticated
WITH CHECK (
  actor_id IS NULL OR actor_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'inhaber'::app_role)
);

-- Helper: Actor-Snapshot (Name aus profiles.name, Rolle aus user_roles)
CREATE OR REPLACE FUNCTION public.activity_log_actor_snapshot(_uid uuid)
RETURNS TABLE(actor_name text, actor_role text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    COALESCE(NULLIF(TRIM(p.name), ''), p.email, 'System') AS actor_name,
    (SELECT ur.role::text FROM public.user_roles ur WHERE ur.user_id = _uid ORDER BY
        CASE ur.role::text
          WHEN 'inhaber' THEN 1 WHEN 'admin' THEN 2 WHEN 'vertriebsleiter' THEN 3
          WHEN 'vertriebspartner' THEN 4 WHEN 'juniorpartner' THEN 5
          WHEN 'setterin' THEN 6 ELSE 99 END LIMIT 1) AS actor_role
  FROM public.profiles p WHERE p.id = _uid;
$$;

-- Trigger: kontakte
CREATE OR REPLACE FUNCTION public.log_kontakt_changes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  changes jsonb := '{}'::jsonb;
  meta_changes jsonb := '{}'::jsonb;
  actor RECORD;
  action_name text := 'kontakt_updated';
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT * INTO actor FROM public.activity_log_actor_snapshot(auth.uid());
    INSERT INTO public.activity_log (kontakt_id, actor_id, actor_name, actor_role, action, entity_type, entity_id, meta, source)
    VALUES (NEW.id, auth.uid(), actor.actor_name, actor.actor_role, 'kontakt_created', 'kontakt', NEW.id,
      jsonb_build_object('name', TRIM(CONCAT_WS(' ', NEW.vorname, NEW.nachname)), 'quelle', NEW.quelle), 'trigger');
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    SELECT * INTO actor FROM public.activity_log_actor_snapshot(auth.uid());
    INSERT INTO public.activity_log (kontakt_id, actor_id, actor_name, actor_role, action, entity_type, entity_id, source)
    VALUES (OLD.id, auth.uid(), actor.actor_name, actor.actor_role, 'kontakt_deleted', 'kontakt', OLD.id, 'trigger');
    RETURN OLD;
  END IF;

  IF NEW.vorname IS DISTINCT FROM OLD.vorname THEN
    changes := changes || jsonb_build_object('vorname', jsonb_build_object('old', OLD.vorname, 'new', NEW.vorname));
  END IF;
  IF NEW.nachname IS DISTINCT FROM OLD.nachname THEN
    changes := changes || jsonb_build_object('nachname', jsonb_build_object('old', OLD.nachname, 'new', NEW.nachname));
  END IF;
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    changes := changes || jsonb_build_object('email', jsonb_build_object('old', OLD.email, 'new', NEW.email));
  END IF;
  IF NEW.telefon IS DISTINCT FROM OLD.telefon THEN
    changes := changes || jsonb_build_object('telefon', jsonb_build_object('old', OLD.telefon, 'new', NEW.telefon));
  END IF;
  IF NEW.zustaendig_id IS DISTINCT FROM OLD.zustaendig_id THEN
    changes := changes || jsonb_build_object('zustaendig_id', jsonb_build_object('old', OLD.zustaendig_id, 'new', NEW.zustaendig_id));
    action_name := 'kontakt_reassigned';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    changes := changes || jsonb_build_object('status', jsonb_build_object('old', OLD.status, 'new', NEW.status));
  END IF;
  IF NEW.archiviert IS DISTINCT FROM OLD.archiviert THEN
    changes := changes || jsonb_build_object('archiviert', jsonb_build_object('old', OLD.archiviert, 'new', NEW.archiviert));
    action_name := CASE WHEN NEW.archiviert THEN 'kontakt_archived' ELSE 'kontakt_unarchived' END;
  END IF;
  IF NEW.geloescht IS DISTINCT FROM OLD.geloescht THEN
    changes := changes || jsonb_build_object('geloescht', jsonb_build_object('old', OLD.geloescht, 'new', NEW.geloescht));
    action_name := CASE WHEN NEW.geloescht THEN 'kontakt_trashed' ELSE 'kontakt_restored' END;
  END IF;

  IF COALESCE(OLD.meta->>'pipelineStufe', '') IS DISTINCT FROM COALESCE(NEW.meta->>'pipelineStufe', '') THEN
    meta_changes := meta_changes || jsonb_build_object('pipelineStufe',
      jsonb_build_object('old', OLD.meta->>'pipelineStufe', 'new', NEW.meta->>'pipelineStufe'));
    SELECT * INTO actor FROM public.activity_log_actor_snapshot(auth.uid());
    INSERT INTO public.activity_log (kontakt_id, actor_id, actor_name, actor_role, action, entity_type, entity_id, changes, source)
    VALUES (NEW.id, auth.uid(), actor.actor_name, actor.actor_role, 'pipeline_changed', 'kontakt', NEW.id,
      jsonb_build_object('pipelineStufe', jsonb_build_object('old', OLD.meta->>'pipelineStufe', 'new', NEW.meta->>'pipelineStufe')),
      'trigger');
  END IF;

  IF COALESCE(OLD.meta->>'nichtErreichtCount', '0') IS DISTINCT FROM COALESCE(NEW.meta->>'nichtErreichtCount', '0') THEN
    meta_changes := meta_changes || jsonb_build_object('nichtErreichtCount',
      jsonb_build_object('old', OLD.meta->>'nichtErreichtCount', 'new', NEW.meta->>'nichtErreichtCount'));
  END IF;
  IF COALESCE(OLD.meta->>'saStatus', '') IS DISTINCT FROM COALESCE(NEW.meta->>'saStatus', '') THEN
    meta_changes := meta_changes || jsonb_build_object('saStatus',
      jsonb_build_object('old', OLD.meta->>'saStatus', 'new', NEW.meta->>'saStatus'));
  END IF;
  IF COALESCE(OLD.meta->>'bonitaetStatus', '') IS DISTINCT FROM COALESCE(NEW.meta->>'bonitaetStatus', '') THEN
    meta_changes := meta_changes || jsonb_build_object('bonitaetStatus',
      jsonb_build_object('old', OLD.meta->>'bonitaetStatus', 'new', NEW.meta->>'bonitaetStatus'));
  END IF;

  IF changes = '{}'::jsonb AND meta_changes = '{}'::jsonb THEN
    RETURN NEW;
  END IF;

  SELECT * INTO actor FROM public.activity_log_actor_snapshot(auth.uid());
  INSERT INTO public.activity_log (kontakt_id, actor_id, actor_name, actor_role, action, entity_type, entity_id, changes, meta, source)
  VALUES (NEW.id, auth.uid(), actor.actor_name, actor.actor_role, action_name, 'kontakt', NEW.id,
    changes || meta_changes, '{}'::jsonb, 'trigger');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_kontakt_changes ON public.kontakte;
CREATE TRIGGER trg_log_kontakt_changes
AFTER INSERT OR UPDATE OR DELETE ON public.kontakte
FOR EACH ROW EXECUTE FUNCTION public.log_kontakt_changes();

-- Trigger: follow_ups
CREATE OR REPLACE FUNCTION public.log_followup_changes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  actor RECORD;
  k_id uuid;
  action_name text;
BEGIN
  BEGIN
    k_id := (COALESCE(NEW.kunde_id, OLD.kunde_id))::uuid;
  EXCEPTION WHEN OTHERS THEN
    RETURN COALESCE(NEW, OLD);
  END;
  IF k_id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  SELECT * INTO actor FROM public.activity_log_actor_snapshot(auth.uid());

  IF TG_OP = 'INSERT' THEN
    action_name := CASE WHEN NEW.automatisch THEN 'followup_auto_created' ELSE 'followup_created' END;
    INSERT INTO public.activity_log (kontakt_id, actor_id, actor_name, actor_role, action, entity_type, entity_id, meta, source)
    VALUES (k_id, auth.uid(), actor.actor_name, actor.actor_role, action_name, 'follow_up', NEW.id,
      jsonb_build_object('titel', NEW.titel, 'typ', NEW.typ, 'faellig_am', NEW.faellig_am, 'prioritaet', NEW.prioritaet), 'trigger');
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    INSERT INTO public.activity_log (kontakt_id, actor_id, actor_name, actor_role, action, entity_type, entity_id, meta, source)
    VALUES (k_id, auth.uid(), actor.actor_name, actor.actor_role, 'followup_deleted', 'follow_up', OLD.id,
      jsonb_build_object('titel', OLD.titel), 'trigger');
    RETURN OLD;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    action_name := CASE
      WHEN NEW.status = 'erledigt' THEN 'followup_completed'
      WHEN OLD.status = 'erledigt' THEN 'followup_reopened'
      ELSE 'followup_status_changed' END;
    INSERT INTO public.activity_log (kontakt_id, actor_id, actor_name, actor_role, action, entity_type, entity_id, changes, meta, source)
    VALUES (k_id, auth.uid(), actor.actor_name, actor.actor_role, action_name, 'follow_up', NEW.id,
      jsonb_build_object('status', jsonb_build_object('old', OLD.status, 'new', NEW.status)),
      jsonb_build_object('titel', NEW.titel), 'trigger');
  END IF;
  IF NEW.faellig_am IS DISTINCT FROM OLD.faellig_am THEN
    INSERT INTO public.activity_log (kontakt_id, actor_id, actor_name, actor_role, action, entity_type, entity_id, changes, meta, source)
    VALUES (k_id, auth.uid(), actor.actor_name, actor.actor_role, 'followup_rescheduled', 'follow_up', NEW.id,
      jsonb_build_object('faellig_am', jsonb_build_object('old', OLD.faellig_am, 'new', NEW.faellig_am)),
      jsonb_build_object('titel', NEW.titel), 'trigger');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_followup_changes ON public.follow_ups;
CREATE TRIGGER trg_log_followup_changes
AFTER INSERT OR UPDATE OR DELETE ON public.follow_ups
FOR EACH ROW EXECUTE FUNCTION public.log_followup_changes();

-- Trigger: aufgaben
CREATE OR REPLACE FUNCTION public.log_aufgabe_changes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  actor RECORD;
  k_id uuid := COALESCE(NEW.kontakt_id, OLD.kontakt_id);
BEGIN
  IF k_id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  SELECT * INTO actor FROM public.activity_log_actor_snapshot(auth.uid());

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.activity_log (kontakt_id, actor_id, actor_name, actor_role, action, entity_type, entity_id, meta, source)
    VALUES (k_id, auth.uid(), actor.actor_name, actor.actor_role, 'aufgabe_created', 'aufgabe', NEW.id,
      jsonb_build_object('titel', NEW.titel, 'typ', NEW.typ, 'prioritaet', NEW.prioritaet, 'faellig_am', NEW.faellig_am), 'trigger');
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    INSERT INTO public.activity_log (kontakt_id, actor_id, actor_name, actor_role, action, entity_type, entity_id, meta, source)
    VALUES (k_id, auth.uid(), actor.actor_name, actor.actor_role, 'aufgabe_deleted', 'aufgabe', OLD.id,
      jsonb_build_object('titel', OLD.titel), 'trigger');
    RETURN OLD;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.activity_log (kontakt_id, actor_id, actor_name, actor_role, action, entity_type, entity_id, changes, meta, source)
    VALUES (k_id, auth.uid(), actor.actor_name, actor.actor_role,
      CASE WHEN NEW.status::text = 'erledigt' THEN 'aufgabe_completed' ELSE 'aufgabe_status_changed' END,
      'aufgabe', NEW.id,
      jsonb_build_object('status', jsonb_build_object('old', OLD.status, 'new', NEW.status)),
      jsonb_build_object('titel', NEW.titel), 'trigger');
  END IF;
  IF NEW.faellig_am IS DISTINCT FROM OLD.faellig_am THEN
    INSERT INTO public.activity_log (kontakt_id, actor_id, actor_name, actor_role, action, entity_type, entity_id, changes, meta, source)
    VALUES (k_id, auth.uid(), actor.actor_name, actor.actor_role, 'aufgabe_rescheduled', 'aufgabe', NEW.id,
      jsonb_build_object('faellig_am', jsonb_build_object('old', OLD.faellig_am, 'new', NEW.faellig_am)),
      jsonb_build_object('titel', NEW.titel), 'trigger');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_aufgabe_changes ON public.aufgaben;
CREATE TRIGGER trg_log_aufgabe_changes
AFTER INSERT OR UPDATE OR DELETE ON public.aufgaben
FOR EACH ROW EXECUTE FUNCTION public.log_aufgabe_changes();

-- Trigger: emails
CREATE OR REPLACE FUNCTION public.log_email_created()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  actor RECORD;
BEGIN
  IF NEW.kontakt_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO actor FROM public.activity_log_actor_snapshot(auth.uid());
  INSERT INTO public.activity_log (kontakt_id, actor_id, actor_name, actor_role, action, entity_type, entity_id, meta, source)
  VALUES (NEW.kontakt_id, auth.uid(), actor.actor_name, actor.actor_role,
    CASE WHEN NEW.ordner::text = 'gesendet' THEN 'email_sent'
         WHEN NEW.ordner::text = 'entwurf'  THEN 'email_draft_saved'
         ELSE 'email_received' END,
    'email', NEW.id,
    jsonb_build_object(
      'betreff', NEW.betreff,
      'absender', NEW.absender_email,
      'ordner', NEW.ordner,
      'empfangen_am', NEW.empfangen_am,
      'vorschau', LEFT(COALESCE(NEW.vorschau, ''), 240)
    ), 'trigger');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_email_created ON public.emails;
CREATE TRIGGER trg_log_email_created
AFTER INSERT ON public.emails
FOR EACH ROW EXECUTE FUNCTION public.log_email_created();
