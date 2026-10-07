-- ===========================================================================
-- Stufe "abrechnung" wie "abgeschlossen": nur Admin, Inhaber, Backoffice, Buchhaltung
-- ===========================================================================
--
-- CHRISTIANS ENTSCHEIDUNG (01.10.2026)
--
--   Die Pipelinestufe "abrechnung" setzt ein Vertriebspartner nicht selbst.
--   Es gelten genau die Regeln der Stufe "abgeschlossen" aus 20260930150000.
--   Ergaenzt am selben Tag: Auch die Buchhaltung setzt beide Stufen.
--
-- WAS DIESE MIGRATION TUT
--
-- Ersetzt nur den Rumpf von pipeline_abschluss_schuetzen(). Der Waechter
-- trg_absicherung_pipeline_abschluss auf investments und kontakte
-- (meta.pipelineStufe) prueft jetzt beide Stufen:
--   - Wechsel AUF oder AUS 'abrechnung' bzw. 'abgeschlossen' nur fuer Admin,
--     Inhaber (is_admin_role), Backoffice und Buchhaltung (has_role) und den Server
--     (auth.uid() IS NULL: Edge Functions mit Dienstschluessel, pg_cron,
--     SQL-Editor).
--   - Sonst bleibt der gespeicherte Wert stehen, ohne Abbruch.
--   - Der Wechsel abrechnung -> abgeschlossen bleibt fuer Backoffice und Buchhaltung frei.
-- Die Trigger werden zur Sicherheit wortgleich neu angelegt, damit die Datei
-- auch fuer sich allein laeuft.
--
-- WER "abrechnung" HEUTE SETZT
--
--   - Abwicklungskarte: Backoffice (oder Admin, Inhaber) hakt
--     "Provisionsrechnung gestellt" ab, der Browser setzt Investment und
--     Kontakt auf 'abrechnung'. Laeuft weiter.
--   - Admin und Inhaber von Hand (Fortschrittsleiste, Pipeline). Laeuft weiter.
--   - Keine Datenbankfunktion und keine Edge Function setzt 'abrechnung';
--     bulk_recompute_pipeline schaltet nur auf 'faelligkeit' und laeuft
--     ohnehin als Server.
--
-- Steht fuer sich: braucht nur is_admin_role und has_role. Ohne sie sperrt
-- nur die Oberflaeche. Aendert keine Daten, wiederholbar.
-- ===========================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.pipeline_abschluss_schuetzen()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _neu_meta jsonb := CASE WHEN jsonb_typeof(NEW.meta) = 'object' THEN NEW.meta ELSE '{}'::jsonb END;
  _alt_wert jsonb;
  _alt text;
  _neu text := _neu_meta ->> 'pipelineStufe';
BEGIN
  IF TG_OP = 'UPDATE' AND jsonb_typeof(OLD.meta) = 'object' THEN
    _alt_wert := OLD.meta -> 'pipelineStufe';
    _alt := OLD.meta ->> 'pipelineStufe';
  END IF;

  IF _alt IS NOT DISTINCT FROM _neu THEN
    RETURN NEW;
  END IF;
  IF coalesce(_alt, '') NOT IN ('abrechnung', 'abgeschlossen')
     AND coalesce(_neu, '') NOT IN ('abrechnung', 'abgeschlossen') THEN
    RETURN NEW;
  END IF;
  IF auth.uid() IS NULL
     OR public.is_admin_role(auth.uid())
     OR public.has_role(auth.uid(), 'backoffice'::public.app_role)
     OR public.has_role(auth.uid(), 'buchhaltung'::public.app_role) THEN
    RETURN NEW;
  END IF;

  RAISE LOG '%.%: Wechsel der Stufe % -> % verworfen (abrechnung und abgeschlossen nur Admin, Inhaber, Backoffice, Buchhaltung)',
    TG_TABLE_NAME, NEW.id, coalesce(_alt, '-'), coalesce(_neu, '-');

  IF _alt_wert IS NULL THEN
    NEW.meta := _neu_meta - 'pipelineStufe';
  ELSE
    NEW.meta := _neu_meta || jsonb_build_object('pipelineStufe', _alt_wert);
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.pipeline_abschluss_schuetzen() IS
  'meta.pipelineStufe auf oder aus ''abrechnung'' und ''abgeschlossen'' nur Admin, '
  'Inhaber, Backoffice, Buchhaltung und Server; sonst bleibt der gespeicherte Wert. '
  'Siehe 20260930150000 und 20261001120000.';

DROP TRIGGER IF EXISTS trg_absicherung_pipeline_abschluss ON public.investments;
CREATE TRIGGER trg_absicherung_pipeline_abschluss
BEFORE INSERT OR UPDATE OF meta ON public.investments
FOR EACH ROW
EXECUTE FUNCTION public.pipeline_abschluss_schuetzen();

DROP TRIGGER IF EXISTS trg_absicherung_pipeline_abschluss ON public.kontakte;
CREATE TRIGGER trg_absicherung_pipeline_abschluss
BEFORE INSERT OR UPDATE OF meta ON public.kontakte
FOR EACH ROW
EXECUTE FUNCTION public.pipeline_abschluss_schuetzen();

REVOKE ALL ON FUNCTION public.pipeline_abschluss_schuetzen() FROM PUBLIC, anon, authenticated;

COMMIT;

-- Nachsehen (aendert nichts): Pruefzeile 56.1 in
-- supabase/migrations-inbox/99_PRUEFUNG.sql.
