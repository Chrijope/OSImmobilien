-- ===========================================================================
-- Stufe "abgeschlossen" nur durch Admin, Inhaber und Backoffice
-- ===========================================================================
--
-- CHRISTIANS ENTSCHEIDUNG (29.09.2026)
--
--   Partner und alle anderen Rollen ausser Admin, Inhaber und Backoffice
--   setzen die Pipelinestufe nicht mehr selbst auf "abgeschlossen". Den
--   Abschluss setzt das Backoffice nach der Auszahlung.
--
-- WARUM
--
-- Bisher konnte ein Partner meta.pipelineStufe direkt auf 'abgeschlossen'
-- stellen (Fortschrittsleiste im Kundenprofil, Ziehen in der Pipeline, oder
-- direkt ueber die Schnittstelle). Das zaehlt als Abschluss in Kennzahlen,
-- Bestandskunden und Portal, obwohl die Auszahlung nur Admin, Inhaber und
-- Backoffice bestaetigen (investment_abwicklung_speichern, 20260930110000).
--
-- WAS DIESE MIGRATION TUT
--
-- Ein Waechter auf investments und kontakte (meta.pipelineStufe):
--   - Wechsel AUF 'abgeschlossen' und Wechsel AUS 'abgeschlossen' nur fuer
--     Admin, Inhaber (is_admin_role), Backoffice (has_role) und den Server
--     (auth.uid() IS NULL: Edge Functions mit Dienstschluessel, pg_cron,
--     SQL-Editor).
--   - Sonst bleibt der gespeicherte Wert stehen, ohne Abbruch, damit das
--     uebrige Speichern weitergeht (Muster der Waechter aus 20260930110000).
--   - Beim Anlegen durch andere Rollen faellt ein 'abgeschlossen' weg; die
--     Stufe ergibt sich dann wie bei jedem neuen Datensatz aus der Anwendung.
--
-- ANDERS ALS DER WAECHTER AUS 20260930110000
--
-- Geprüfte SECURITY-DEFINER-Funktionen kommen hier NICHT pauschal durch.
-- merge_investment_meta ist DEFINER und laesst Mitarbeiter beliebige
-- Schluessel mischen, also auch pipelineStufe. Mit der current_user-Ausnahme
-- stuende der Weg offen. Deshalb zaehlt allein, wer angemeldet ist. Keine
-- Datenbankfunktion setzt heute 'abgeschlossen' im Namen eines Partners;
-- die naechtliche Neuberechnung (bulk_recompute_pipeline, nur Server) schaltet
-- nur auf 'faelligkeit'.
--
-- LEGITIME WEGE, DIE WEITERLAUFEN
--
--   - Abwicklungskarte: Backoffice (oder Admin, Inhaber) hakt "Auszahlung
--     bestaetigt" ab, der Browser setzt danach Investment und Kontakt auf
--     'abgeschlossen'. Angemeldet ist das Backoffice, der Waechter laesst durch.
--   - Admin und Inhaber setzen die Stufe von Hand (Fortschrittsleiste,
--     Pipeline), auch zurueck.
--   - Server und SQL-Editor.
--
-- REIHENFOLGE DER TRIGGER
--
-- Postgres ruft BEFORE-Trigger in der Reihenfolge ihrer Namen auf.
-- trg_absicherung_pipeline_abschluss laeuft auf investments nach
-- trg_absicherung_investments und vor trg_finanzierungsstand_intern_frei und
-- trg_investments_provisionssatz_festschreiben; beide sehen damit schon die
-- bereinigte Stufe. Gemeinsame Schluessel gibt es keine. Der AFTER-Trigger
-- trg_notify_vp_pipeline_change meldet einen verworfenen Wechsel nicht.
--
-- Steht fuer sich: braucht nur is_admin_role und has_role, keine andere
-- offene Migration. Die Anwendung laeuft auch ohne sie; dann greift nur die
-- Sperre in der Oberflaeche.
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
  IF coalesce(_alt, '') <> 'abgeschlossen' AND coalesce(_neu, '') <> 'abgeschlossen' THEN
    RETURN NEW;
  END IF;
  IF auth.uid() IS NULL
     OR public.is_admin_role(auth.uid())
     OR public.has_role(auth.uid(), 'backoffice'::public.app_role) THEN
    RETURN NEW;
  END IF;

  RAISE LOG '%.%: Wechsel der Stufe % -> % verworfen (abgeschlossen nur Admin, Inhaber, Backoffice)',
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
  'meta.pipelineStufe auf oder aus ''abgeschlossen'' nur Admin, Inhaber, '
  'Backoffice und Server; sonst bleibt der gespeicherte Wert. Siehe 20260930150000.';

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

-- Triggerfunktionen ruft Postgres ohne Rechtepruefung auf; niemand soll sie
-- direkt aufrufen.
REVOKE ALL ON FUNCTION public.pipeline_abschluss_schuetzen() FROM PUBLIC, anon, authenticated;

COMMIT;

-- Nachsehen (aendert nichts): Pruefzeilen 55.1 bis 55.3 in
-- supabase/migrations-inbox/99_PRUEFUNG.sql.
