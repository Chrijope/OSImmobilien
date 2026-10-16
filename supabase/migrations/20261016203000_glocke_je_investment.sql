-- Pipeline am Investment, Etappe 4: Die Glocke "Pipeline-Stufe geaendert"
-- laeutet je Investment (Freigabe Christian, 11.10.2026).
--
-- Bisher hing sie am Kontakt (trg_notify_vp_pipeline_change, 20260707093549)
-- und laeutete nur, wenn sich die Kontaktstufe aenderte. Seit 20261016201000
-- ist die Kontaktstufe die hoechste Stufe der laufenden Investments: Rueckte
-- Investment 2 vor, waehrend Investment 1 weiter war, erfuhr der Partner
-- nichts. Jetzt meldet jeder Stufenwechsel eines Investments, mit dessen
-- Nummer. Der Trigger am Kontakt wird entfernt, sonst kaeme jede Meldung
-- doppelt (der Nachfuehr-Trigger aendert die Kontaktstufe mit).
-- Wie bisher: keine Glocke ohne Zustaendigen und keine an den, der selbst
-- geaendert hat. Aendert keine Daten, wiederholbar.

CREATE OR REPLACE FUNCTION public.notify_vp_on_investment_stufe()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _alt text := COALESCE(public.pipeline_stufe_normalisieren(OLD.meta->>'pipelineStufe'), '');
  _neu text := COALESCE(public.pipeline_stufe_normalisieren(NEW.meta->>'pipelineStufe'), '');
  _kontakt record;
  _label text;
  _actor uuid := auth.uid();
BEGIN
  IF _neu = _alt OR _neu = '' THEN
    RETURN NEW;
  END IF;

  SELECT id, zustaendig_id, vorname, nachname INTO _kontakt
  FROM public.kontakte WHERE id = NEW.kunde_id;
  IF _kontakt.zustaendig_id IS NULL THEN
    RETURN NEW;
  END IF;
  -- Der Partner hat die Aenderung selbst gemacht: keine Selbst-Benachrichtigung.
  IF _actor IS NOT NULL AND _actor = _kontakt.zustaendig_id THEN
    RETURN NEW;
  END IF;

  _label := CASE _neu
    WHEN 'neuer_lead' THEN 'Neuer Lead'
    WHEN 'zugewiesen' THEN 'Zugewiesen'
    WHEN 'kontaktversuche' THEN 'Kontaktversuche'
    WHEN 'nicht_erreicht' THEN 'Nicht erreicht'
    WHEN 'erreicht' THEN 'Erreicht'
    WHEN 'follow_up' THEN 'Follow-Up'
    WHEN 'erstgespraech_geplant' THEN 'Erstgespräch'
    WHEN 'eg_noshow' THEN 'EG NoShow'
    WHEN 'beratungsgespraech' THEN 'Beratungsgespräch'
    WHEN 'bg_noshow' THEN 'BG NoShow'
    WHEN 'selbstauskunft' THEN 'Selbstauskunft'
    WHEN 'objektauswahl' THEN 'Objektauswahl'
    WHEN 'follow_up_objekt' THEN 'Follow-Up'
    WHEN 'reservierung' THEN 'Reservierung'
    WHEN 'bonitaetsunterlagen' THEN 'Bonitätsunterlagen'
    WHEN 'finanzierung' THEN 'Finanzierung'
    WHEN 'notar' THEN 'Notar'
    WHEN 'faelligkeit' THEN 'Kaufpreisfälligkeit'
    WHEN 'abrechnung' THEN 'Abrechnung'
    WHEN 'abgeschlossen' THEN 'Abgeschlossen'
    WHEN 'bestandsimport' THEN 'Bestandskunden Import'
    WHEN 'verloren' THEN 'Verloren'
    WHEN 'archiviert' THEN 'Archiviert'
    ELSE _neu
  END;

  INSERT INTO public.benachrichtigungen (benutzer_id, titel, nachricht, link, gelesen)
  VALUES (
    _kontakt.zustaendig_id,
    'Pipeline-Stufe geändert: ' || _label,
    trim(COALESCE(_kontakt.vorname, '') || ' ' || COALESCE(_kontakt.nachname, ''))
      || ' (' || COALESCE(NULLIF(NEW.meta->>'label', ''), 'Investment ' || COALESCE(NEW.meta->>'nummer', '?'))
      || ') wurde auf Stufe „' || _label || '" verschoben.',
    '/kunden/' || NEW.kunde_id::text || '?investment=' || NEW.id::text,
    false
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_vp_on_investment_stufe() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_notify_vp_investment_stufe ON public.investments;
CREATE TRIGGER trg_notify_vp_investment_stufe
AFTER UPDATE OF meta ON public.investments
FOR EACH ROW
WHEN (OLD.meta->>'pipelineStufe' IS DISTINCT FROM NEW.meta->>'pipelineStufe')
EXECUTE FUNCTION public.notify_vp_on_investment_stufe();

-- Der alte Trigger am Kontakt. Die Funktion bleibt stehen (nichts ruft sie
-- mehr auf), damit ein Zuruecksetzen nur den Trigger wieder anlegen muss:
--   CREATE TRIGGER trg_notify_vp_pipeline_change AFTER UPDATE ON public.kontakte
--   FOR EACH ROW WHEN (OLD.meta IS DISTINCT FROM NEW.meta OR OLD.zustaendig_id IS DISTINCT FROM NEW.zustaendig_id)
--   EXECUTE FUNCTION public.notify_vp_on_pipeline_change();
DROP TRIGGER IF EXISTS trg_notify_vp_pipeline_change ON public.kontakte;
