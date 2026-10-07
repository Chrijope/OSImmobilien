-- ===========================================================================
-- Provisionsbescheide ab Freigabe gesperrt
-- ===========================================================================
--
-- Entscheidung vom 04.10.2026: „Abrechnungen neu berechnen“ auf
-- /provisionsabrechnung aendert einen Bescheid nur, solange er „offen“ ist.
-- Ein freigegebener oder ausgezahlter Bescheid ist ein Beleg. Bisher
-- ueberschrieb ein Neuberechnen seine Posten und Summen, nur der Status
-- blieb stehen; ausgezahlt war danach ein anderer Betrag als ueberwiesen.
--
-- Die Oberflaeche ueberspringt solche Bescheide seit dem 04.10.2026 selbst
-- (`bescheidVeraenderbar` in src/lib/provisionsAbrechnungStore.ts). Dieser
-- Ausloeser haelt es zusaetzlich in der Datenbank fest, auch fuer einen
-- veralteten Tab oder einen direkten Aufruf.
--
-- Was gesperrt ist: Monat, Partner, Posten und alle Summen. Was frei bleibt:
-- der Status selbst (auch zurueck auf „offen“, danach ist der Bescheid
-- wieder veraenderbar), Freigabe- und Auszahlungsvermerke, PDF-Vermerk,
-- Beleg. Geprueft wird der ALTE Status: Wer in einem Schritt den Status
-- zuruecksetzt und neue Zahlen schreibt, wird abgelehnt.
--
-- Zweiter Ausloeser: Kein Investment in zwei Monaten. Wird ein Bescheid
-- freigegeben oder ausgezahlt (oder so angelegt), darf keine seiner
-- Investment-Kennungen schon in einem anderen freigegebenen oder
-- ausgezahlten Bescheid desselben Partners stehen. Eine Sperre je Partner
-- verhindert, dass zwei gleichzeitige Freigaben beide durchkommen. Posten
-- aelterer Bescheide ohne Investment-Kennung prueft er nicht; die zeigt die
-- Oberflaeche als „Bitte klaeren“.
--
-- Dritter Ausloeser: Ein Bescheid mit Status ungleich „offen“ laesst sich
-- aus dem Browser nicht loeschen (Rolle im Anmeldetoken `authenticated` oder
-- `anon`, wie bei `loeschen_aus_dem_browser` aus 20261004193000; hier
-- eigenstaendig, damit die Reihenfolge egal bleibt). Dienstrolle und
-- SQL-Editor bleiben frei.
--
-- Steht fuer sich, Reihenfolge egal, keine Function auszurollen, aendert
-- keine Daten, wiederholbar. Ohne sie sperrt nur die Oberflaeche.
-- ===========================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.provisionsabrechnung_bescheid_sperre()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.status <> 'offen' AND (
       NEW.monat IS DISTINCT FROM OLD.monat
    OR NEW.user_id IS DISTINCT FROM OLD.user_id
    OR NEW.eigene_deals IS DISTINCT FROM OLD.eigene_deals
    OR NEW.overrides_erhalten IS DISTINCT FROM OLD.overrides_erhalten
    OR NEW.overheads_abgezogen IS DISTINCT FROM OLD.overheads_abgezogen
    OR NEW.summe_eigen IS DISTINCT FROM OLD.summe_eigen
    OR NEW.summe_overrides_erhalten IS DISTINCT FROM OLD.summe_overrides_erhalten
    OR NEW.summe_overhead IS DISTINCT FROM OLD.summe_overhead
    OR NEW.netto IS DISTINCT FROM OLD.netto
  ) THEN
    RAISE EXCEPTION 'Bescheid ist gesperrt (Status %), die Zahlen bleiben unveraendert.', OLD.status
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.provisionsabrechnung_bescheid_sperre() FROM anon, public, authenticated;

DROP TRIGGER IF EXISTS trg_provisionsabrechnung_bescheid_sperre ON public.provisionsabrechnungen;
CREATE TRIGGER trg_provisionsabrechnung_bescheid_sperre
  BEFORE UPDATE ON public.provisionsabrechnungen
  FOR EACH ROW EXECUTE FUNCTION public.provisionsabrechnung_bescheid_sperre();

CREATE OR REPLACE FUNCTION public.provisionsabrechnung_keine_doppelung()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  _monate text;
BEGIN
  IF NEW.status NOT IN ('freigegeben', 'ausgezahlt') THEN
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('provisionsabrechnung:' || NEW.user_id::text));
  SELECT string_agg(DISTINCT p.monat, ', ') INTO _monate
    FROM public.provisionsabrechnungen p
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(p.eigene_deals) = 'array' THEN p.eigene_deals ELSE '[]'::jsonb END
    ) AS alt(posten)
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(NEW.eigene_deals) = 'array' THEN NEW.eigene_deals ELSE '[]'::jsonb END
    ) AS neu(posten)
   WHERE p.user_id = NEW.user_id
     AND p.id <> NEW.id
     AND p.status IN ('freigegeben', 'ausgezahlt')
     AND nullif(alt.posten ->> 'investmentId', '') IS NOT NULL
     AND alt.posten ->> 'investmentId' = neu.posten ->> 'investmentId';
  IF _monate IS NOT NULL THEN
    RAISE EXCEPTION 'Abschluss doppelt abgerechnet: steht schon im Bescheid %', _monate
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.provisionsabrechnung_keine_doppelung() FROM anon, public, authenticated;

DROP TRIGGER IF EXISTS trg_provisionsabrechnung_keine_doppelung ON public.provisionsabrechnungen;
CREATE TRIGGER trg_provisionsabrechnung_keine_doppelung
  BEFORE INSERT OR UPDATE ON public.provisionsabrechnungen
  FOR EACH ROW EXECUTE FUNCTION public.provisionsabrechnung_keine_doppelung();

CREATE OR REPLACE FUNCTION public.provisionsabrechnung_loeschen_pruefen()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.status <> 'offen'
     AND coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '')
         IN ('authenticated', 'anon') THEN
    RAISE EXCEPTION 'Bescheid ist gesperrt (Status %), er bleibt als Beleg erhalten.', OLD.status
      USING ERRCODE = 'P0001';
  END IF;
  RETURN OLD;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.provisionsabrechnung_loeschen_pruefen() FROM anon, public, authenticated;

DROP TRIGGER IF EXISTS trg_provisionsabrechnung_loeschen_pruefen ON public.provisionsabrechnungen;
CREATE TRIGGER trg_provisionsabrechnung_loeschen_pruefen
  BEFORE DELETE ON public.provisionsabrechnungen
  FOR EACH ROW EXECUTE FUNCTION public.provisionsabrechnung_loeschen_pruefen();

COMMIT;

-- Nachsehen (aendert nichts): Pruefzeilen 75.1 bis 75.3 in
-- supabase/migrations-inbox/99_PRUEFUNG.sql.
