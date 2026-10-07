
-- Trigger: benachrichtigt zuständigen VP, wenn Pipeline-Stufe von jemand anderem geändert wird
CREATE OR REPLACE FUNCTION public.notify_vp_on_pipeline_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  old_stufe TEXT;
  new_stufe TEXT;
  stufe_label TEXT;
  kunde_name TEXT;
  actor_id UUID;
BEGIN
  old_stufe := COALESCE(OLD.meta->>'pipelineStufe', '');
  new_stufe := COALESCE(NEW.meta->>'pipelineStufe', '');

  IF new_stufe = old_stufe OR new_stufe = '' THEN
    RETURN NEW;
  END IF;

  IF NEW.zustaendig_id IS NULL THEN
    RETURN NEW;
  END IF;

  actor_id := auth.uid();
  -- VP hat die Änderung selbst gemacht -> keine Selbst-Benachrichtigung
  IF actor_id IS NOT NULL AND actor_id = NEW.zustaendig_id THEN
    RETURN NEW;
  END IF;

  stufe_label := CASE new_stufe
    WHEN 'neuer_lead' THEN 'Neuer Lead'
    WHEN 'kontaktversuche' THEN 'Kontaktversuche'
    WHEN 'follow_up' THEN 'Follow-Up'
    WHEN 'erstgespraech' THEN 'Erstgespräch'
    WHEN 'beratungsgespraech' THEN 'Beratungsgespräch'
    WHEN 'bonitaetsunterlagen' THEN 'Bonitätsunterlagen'
    WHEN 'objektauswahl' THEN 'Objektauswahl'
    WHEN 'reservierung' THEN 'Reservierung'
    WHEN 'finanzierung' THEN 'Finanzierung'
    WHEN 'notar' THEN 'Notar'
    WHEN 'faelligkeit' THEN 'Kaufpreisfälligkeit'
    WHEN 'abgeschlossen' THEN 'Abgeschlossen'
    WHEN 'verloren' THEN 'Verloren'
    ELSE new_stufe
  END;

  kunde_name := trim(COALESCE(NEW.vorname, '') || ' ' || COALESCE(NEW.nachname, ''));

  INSERT INTO public.benachrichtigungen (benutzer_id, titel, nachricht, link, gelesen)
  VALUES (
    NEW.zustaendig_id,
    'Pipeline-Stufe geändert: ' || stufe_label,
    kunde_name || ' wurde auf Stufe „' || stufe_label || '" verschoben.',
    '/kunden/' || NEW.id::text,
    false
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_vp_pipeline_change ON public.kontakte;
CREATE TRIGGER trg_notify_vp_pipeline_change
  AFTER UPDATE ON public.kontakte
  FOR EACH ROW
  WHEN (OLD.meta IS DISTINCT FROM NEW.meta OR OLD.zustaendig_id IS DISTINCT FROM NEW.zustaendig_id)
  EXECUTE FUNCTION public.notify_vp_on_pipeline_change();
