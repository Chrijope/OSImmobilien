-- ===========================================================================
-- Buchhaltung: Kundendaten nur lesend (Christian, 18.10.2026)
-- ===========================================================================
--
-- WARUM
--
--   Christian: „Die Buchhaltung darf in den Kontakten nichts verändern
--   können. und in der Pipeline genauso, nur lesend.“ Rückfrage geklärt:
--   Die Stufen „Abrechnung“ und „Abgeschlossen“ setzt sie weiter
--   (pipeline_abschluss_schuetzen, 20261001120000).
--
--   Seit 20260916190000 hat die Buchhaltung über darf_alle_kunden_sehen
--   Lese- UND Schreibzugriff auf Kontakte, Investments und Finanzierungen.
--   Diese Migration nimmt ihr das Schreiben, ohne die anderen Regeln
--   anzufassen.
--
-- WEN ES TRIFFT
--
--   Nur Nutzer, deren EINZIGE kundenberechtigte Rolle die Buchhaltung ist
--   (nur_lesend_kundendaten). Wer zusätzlich z. B. Backoffice oder Admin ist,
--   behält seine Rechte. Der Server (auth.uid() IS NULL) ist nie betroffen.
--
-- WAS DIESE MIGRATION TUT
--
--   1. Funktion nur_lesend_kundendaten(uuid).
--   2. Wächter vor UPDATE auf kontakte und investments: Es bleibt die alte
--      Zeile stehen, übernommen werden nur meta.pipelineStufe (wenn alt oder
--      neu „abrechnung“/„abgeschlossen“ ist) und bei „abgeschlossen“ der
--      Kontaktstatus „kunde“ (abwicklungStufe.ts). Kein Abbruch, wie beim
--      Abschluss-Wächter.
--   3. RESTRICTIVE-Policies: kein INSERT und DELETE auf kontakte und
--      investments, kein INSERT/UPDATE/DELETE auf finanzierungen,
--      kunde_dokumente, objektvorstellungen, signature_requests,
--      gespraech_mitschriften, investment_berechnungen, empfehlungen.
--
--   Bewusst NICHT gesperrt: aufgaben und aktivitaeten (eigene Aufgaben wie
--   „Provision abrechnen“, Verlauf beim Stufenwechsel), Abrechnungen und
--   Provisionen (Kernaufgabe der Buchhaltung), Protokolltabellen.
--
--   Ändert keine Daten, wiederholbar.
-- ===========================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.nur_lesend_kundendaten(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _user_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'buchhaltung')
    AND NOT EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = _user_id
        AND role IN ('admin', 'inhaber', 'vertriebsleiter', 'backoffice', 'finanzierungspartner',
                     'setterin', 'individuell', 'testaccount', 'vertriebspartner')
    )
$$;

COMMENT ON FUNCTION public.nur_lesend_kundendaten(uuid) IS
  'Darf dieser Nutzer Kundendaten nur lesen? Wahr, wenn die Buchhaltung seine einzige '
  'kundenberechtigte Rolle ist (Christian, 18.10.2026).';

REVOKE ALL ON FUNCTION public.nur_lesend_kundendaten(uuid) FROM public;
REVOKE ALL ON FUNCTION public.nur_lesend_kundendaten(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.nur_lesend_kundendaten(uuid) TO authenticated;

-- 2) Wächter für UPDATE auf kontakte und investments ------------------------

CREATE OR REPLACE FUNCTION public.kundendaten_nur_lesend_schuetzen()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _alt_meta jsonb := CASE WHEN jsonb_typeof(OLD.meta) = 'object' THEN OLD.meta ELSE '{}'::jsonb END;
  _neu_meta jsonb := CASE WHEN jsonb_typeof(NEW.meta) = 'object' THEN NEW.meta ELSE '{}'::jsonb END;
  _alt text := _alt_meta ->> 'pipelineStufe';
  _neu text := _neu_meta ->> 'pipelineStufe';
  _neuer_status text;
  _geaendert boolean := NEW IS DISTINCT FROM OLD;
BEGIN
  IF auth.uid() IS NULL OR NOT public.nur_lesend_kundendaten(auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'kontakte' THEN
    _neuer_status := NEW.status;
  END IF;

  -- Alles bleibt wie vorher ...
  NEW := OLD;
  -- ... ausser dem erlaubten Stufenwechsel.
  IF _alt IS DISTINCT FROM _neu
     AND (coalesce(_alt, '') IN ('abrechnung', 'abgeschlossen') OR coalesce(_neu, '') IN ('abrechnung', 'abgeschlossen')) THEN
    NEW.meta := _alt_meta || jsonb_build_object('pipelineStufe', _neu_meta -> 'pipelineStufe');
    IF TG_TABLE_NAME = 'kontakte' AND _neu = 'abgeschlossen' AND _neuer_status = 'kunde' THEN
      NEW.status := 'kunde';
    END IF;
  ELSIF _geaendert THEN
    RAISE LOG '%.%: Änderung durch Buchhaltung (nur lesend) verworfen', TG_TABLE_NAME, OLD.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_zz_kundendaten_nur_lesend ON public.kontakte;
CREATE TRIGGER trg_zz_kundendaten_nur_lesend
  BEFORE UPDATE ON public.kontakte
  FOR EACH ROW EXECUTE FUNCTION public.kundendaten_nur_lesend_schuetzen();

DROP TRIGGER IF EXISTS trg_zz_kundendaten_nur_lesend ON public.investments;
CREATE TRIGGER trg_zz_kundendaten_nur_lesend
  BEFORE UPDATE ON public.investments
  FOR EACH ROW EXECUTE FUNCTION public.kundendaten_nur_lesend_schuetzen();

-- 3) RESTRICTIVE-Policies ---------------------------------------------------

DO $$
DECLARE
  _t text;
  _cmd text;
BEGIN
  -- kontakte und investments: Anlegen und Löschen
  FOREACH _t IN ARRAY ARRAY['kontakte', 'investments'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Buchhaltung legt nicht an" ON public.%I', _t);
    EXECUTE format('CREATE POLICY "Buchhaltung legt nicht an" ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated
                    WITH CHECK (NOT (select public.nur_lesend_kundendaten(auth.uid())))', _t);
    EXECUTE format('DROP POLICY IF EXISTS "Buchhaltung loescht nicht" ON public.%I', _t);
    EXECUTE format('CREATE POLICY "Buchhaltung loescht nicht" ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated
                    USING (NOT (select public.nur_lesend_kundendaten(auth.uid())))', _t);
  END LOOP;

  -- Nebentabellen mit Kundendaten: gar nicht schreiben
  FOREACH _t IN ARRAY ARRAY['finanzierungen', 'kunde_dokumente', 'objektvorstellungen', 'signature_requests',
                            'gespraech_mitschriften', 'investment_berechnungen', 'empfehlungen'] LOOP
    IF to_regclass('public.' || _t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('DROP POLICY IF EXISTS "Buchhaltung legt nicht an" ON public.%I', _t);
    EXECUTE format('CREATE POLICY "Buchhaltung legt nicht an" ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated
                    WITH CHECK (NOT (select public.nur_lesend_kundendaten(auth.uid())))', _t);
    EXECUTE format('DROP POLICY IF EXISTS "Buchhaltung aendert nicht" ON public.%I', _t);
    EXECUTE format('CREATE POLICY "Buchhaltung aendert nicht" ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated
                    USING (NOT (select public.nur_lesend_kundendaten(auth.uid())))', _t);
    EXECUTE format('DROP POLICY IF EXISTS "Buchhaltung loescht nicht" ON public.%I', _t);
    EXECUTE format('CREATE POLICY "Buchhaltung loescht nicht" ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated
                    USING (NOT (select public.nur_lesend_kundendaten(auth.uid())))', _t);
  END LOOP;
END
$$;

COMMIT;
