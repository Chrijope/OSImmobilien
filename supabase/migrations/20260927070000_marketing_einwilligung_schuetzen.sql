-- ===========================================================================
-- Nachweis der Pixel-Einwilligung am Lead nur durch den Server
-- ===========================================================================
--
-- AUSGANGSLAGE (Codex-Pruefung 27.09.2026, PIXEL-003)
--
-- `submit-lead` legt am Lead den Nachweis ab, dass der Besucher dem Meta
-- Pixel GENAU dieses Partners zugestimmt hat: `kontakte.meta ->
-- 'marketingEinwilligung'` (Fassung, Zeitpunkt, Partner, Pruefzeitpunkt).
-- Diesen Wert konnten interne Rollen, auch Vertriebspartner, ueber die RPC
-- `merge_kontakt_meta` oder ein direktes Update anlegen, aendern oder
-- loeschen. Als Beweis taugte er so nicht.
--
-- WAS DIESE MIGRATION TUT
--
-- Ein Ausloeser auf `kontakte` haelt den Schluessel fest. Aendern darf ihn
-- nur der Dienstschluessel (`auth.uid()` leer: Edge Functions wie
-- submit-lead, dazu der SQL-Editor). Fuer alle anderen gilt:
--   Anlegen   ein mitgeschickter Nachweis wird entfernt,
--   Aendern   der alte Wert bleibt stehen,
--   Loeschen  der alte Wert bleibt stehen.
--
-- Bewusst Zuruecksetzen statt Fehler: Das CRM speichert `meta` an vielen
-- Stellen im Ganzen aus seinem Zwischenspeicher. Hat submit-lead den
-- Nachweis inzwischen an einen bestehenden Kontakt gehaengt (Dublette),
-- fehlte er in einer aelteren Ansicht, und ein Fehler liesse das ganze
-- Speichern scheitern. So geht das Speichern durch, der Nachweis bleibt.
--
-- `merge_kontakt_meta` aendert nur die mitgeschickten Schluessel und laeuft
-- unveraendert durch. `kontakte_zusammenfuehren` schreibt `meta` des aelteren
-- Kontakts neu; der Ausloeser behaelt dabei dessen eigenen, aelteren Nachweis
-- (fehlt dort einer, wird keiner vom neueren uebernommen). Der neuere Kontakt
-- wandert mit seinem Nachweis unveraendert in den Papierkorb.
--
-- Ein `meta`, das kein Objekt ist (NULL, JSON null, [], Zahl, Text), nimmt
-- den Nachweis nicht mehr mit: Hatte die Zeile einen, bleibt das alte `meta`
-- stehen (Codex-Pruefung 27.09.2026, NB-06).
--
-- Wiederholbar: CREATE OR REPLACE und DROP TRIGGER IF EXISTS.
-- Ohne diese Migration laeuft alles wie bisher, nur ohne den Schutz.
-- ===========================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.kontakt_marketing_nachweis_schuetzen()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  neu_meta jsonb := coalesce(NEW.meta, '{}'::jsonb);
  alt_hat_nachweis boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    alt_hat_nachweis := jsonb_typeof(OLD.meta) = 'object' AND OLD.meta ? 'marketingEinwilligung';
  END IF;
  -- Ein meta, das kein Objekt ist (NULL, JSON null, [], Zahl, Text), wuerde
  -- den Nachweis still mitnehmen. Hatte die Zeile einen, bleibt das alte
  -- meta stehen (NB-06). Ohne Nachweis gibt es nichts zu schuetzen.
  IF NEW.meta IS NULL OR jsonb_typeof(NEW.meta) <> 'object' THEN
    IF alt_hat_nachweis THEN
      NEW.meta := OLD.meta;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF neu_meta ? 'marketingEinwilligung' THEN
      NEW.meta := neu_meta - 'marketingEinwilligung';
    END IF;
    RETURN NEW;
  END IF;

  IF (neu_meta -> 'marketingEinwilligung') IS NOT DISTINCT FROM (OLD.meta -> 'marketingEinwilligung') THEN
    RETURN NEW;
  END IF;
  IF alt_hat_nachweis THEN
    NEW.meta := jsonb_set(neu_meta, '{marketingEinwilligung}', OLD.meta -> 'marketingEinwilligung', true);
  ELSE
    NEW.meta := neu_meta - 'marketingEinwilligung';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.kontakt_marketing_nachweis_schuetzen() IS
  'kontakte.meta.marketingEinwilligung (Nachweis der Pixel-Einwilligung) schreibt nur der Dienstschluessel. '
  'Andere Aenderungen daran werden still zurueckgesetzt. Migration 20260927070000.';

REVOKE ALL ON FUNCTION public.kontakt_marketing_nachweis_schuetzen() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS trg_kontakt_marketing_nachweis ON public.kontakte;
CREATE TRIGGER trg_kontakt_marketing_nachweis
  BEFORE INSERT OR UPDATE OF meta ON public.kontakte
  FOR EACH ROW
  EXECUTE FUNCTION public.kontakt_marketing_nachweis_schuetzen();

COMMIT;
