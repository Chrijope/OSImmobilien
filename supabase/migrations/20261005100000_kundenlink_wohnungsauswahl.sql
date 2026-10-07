-- ===========================================================================
-- Kundenlink: Wohnungsauswahl der Objektübersicht
-- ===========================================================================
--
-- WARUM ES DIESE MIGRATION GIBT
--
--   GL, 05.10.2026: Im Fenster „Kundenlink senden“ wählt er bei der
--   Objektübersicht, welche freien Wohnungen des Hauses der Kunde über den
--   Link sieht. Die Einschränkung muss auf dem Server gelten, nicht nur in
--   der Oberfläche: `get-kundenansicht` gibt nur die gewählten Wohnungen
--   heraus, auch wenn jemand eine andere Wohnungskennung in die Adresse
--   schreibt.
--
-- WAS SIE TUT
--
--   Spalte `objekt_exposes.wohnung_auswahl` (uuid[]), leer erlaubt.
--     - leer (NULL): keine Auswahl, der Kunde sieht alle freien Wohnungen.
--       So bleiben alle vorhandenen Links, und so speichert der Versand, wenn
--       im Fenster alle Wohnungen angehakt sind.
--     - eine Liste: nur diese Wohnungen, solange sie frei sind. Wird eine
--       reserviert oder verkauft, fällt sie wie bisher weg.
--   Erneut senden ersetzt die Auswahl des bestehenden Links.
--   Eine Prüfregel lässt eine Liste nur bei der Objektübersicht zu und nie
--   leer.
--
--   Auslöser `trg_objekt_exposes_kundenlink_nur_server` (Prüfung Codex,
--   05.10.2026): `art` und `wohnung_auswahl` ändert nur der Server
--   (`send-kunden-expose` mit Dienstrolle, SQL-Editor). Aus dem Browser
--   (Rolle im Token `authenticated` oder `anon`) lehnt die Datenbank eine
--   Änderung ab, beim Anlegen alles außer art = 'expose' ohne Auswahl. Sonst
--   könnte jemand mit Schreibrecht auf die Zeile die Auswahl seines Links
--   aufheben. Der Browser schreibt beide Spalten heute nirgends: Er legt nur
--   interne Exposés an (`speichereExpose`, ohne `art`) und setzt
--   `zurueckgezogen_am`. Andere Spalten bleiben unberührt, auch für
--   SECURITY-DEFINER-Funktionen wie `kontakte_zusammenfuehren`.
--
-- VORAUSSETZUNG
--
--   20260923171000_kundenlink_objektuebersicht.sql (Spalte `art`, am
--   24.09.2026 gelaufen). Fehlt sie, bricht diese Migration am Anfang ab und
--   ändert nichts.
--
-- OHNE DIESE MIGRATION
--
--   Alles läuft wie bisher: Die Objektübersicht geht mit allen Wohnungen
--   hinaus. Nur eine echte Auswahl lehnt `send-kunden-expose` mit
--   „Migration Wohnungsauswahl noch nicht ausgeführt“ ab, bevor etwas
--   geschrieben oder verschickt wird.
--
-- ZURÜCKDREHEN (falls nötig)
--
--   drop trigger if exists trg_objekt_exposes_kundenlink_nur_server on public.objekt_exposes;
--   drop function if exists public.objekt_exposes_kundenlink_nur_server();
--   alter table public.objekt_exposes drop constraint if exists objekt_exposes_wohnung_auswahl_check;
--   alter table public.objekt_exposes drop column if exists wohnung_auswahl;
--
--   Achtung: Danach zeigen eingeschränkte Links wieder alle freien Wohnungen.
--
-- WIEDERHOLBAR, ÄNDERT KEINE DATEN. Reihenfolge egal, am besten aber vor
-- dem Ausrollen von get-kundenansicht und send-kunden-expose.
-- ===========================================================================


DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'objekt_exposes'
       AND column_name = 'art'
  ) THEN
    RAISE EXCEPTION 'Zuerst 20260923171000_kundenlink_objektuebersicht.sql ausführen, dann diese Migration.';
  END IF;
END $$;


ALTER TABLE public.objekt_exposes
  ADD COLUMN IF NOT EXISTS wohnung_auswahl uuid[];

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'objekt_exposes_wohnung_auswahl_check'
  ) THEN
    ALTER TABLE public.objekt_exposes
      ADD CONSTRAINT objekt_exposes_wohnung_auswahl_check
      CHECK (wohnung_auswahl IS NULL OR (art = 'objektuebersicht' AND cardinality(wohnung_auswahl) >= 1));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.objekt_exposes_kundenlink_nur_server()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '')
       NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.art IS DISTINCT FROM 'expose' OR NEW.wohnung_auswahl IS NOT NULL THEN
      RAISE EXCEPTION 'Kundenlinks der Objektübersicht legt nur „Kundenlink senden“ an.' USING ERRCODE = '42501';
    END IF;
  ELSIF NEW.art IS DISTINCT FROM OLD.art OR NEW.wohnung_auswahl IS DISTINCT FROM OLD.wohnung_auswahl THEN
    RAISE EXCEPTION 'Art und Wohnungsauswahl eines Kundenlinks ändert nur „Kundenlink senden“.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.objekt_exposes_kundenlink_nur_server() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS trg_objekt_exposes_kundenlink_nur_server ON public.objekt_exposes;
CREATE TRIGGER trg_objekt_exposes_kundenlink_nur_server
  BEFORE INSERT OR UPDATE ON public.objekt_exposes
  FOR EACH ROW EXECUTE FUNCTION public.objekt_exposes_kundenlink_nur_server();

COMMENT ON COLUMN public.objekt_exposes.wohnung_auswahl IS
  'Nur bei der Objektübersicht: die Wohnungen, die der Kunde über den Link sieht, solange sie frei sind. Leer: alle freien Wohnungen.';


-- Zum Schluss: der Stand danach. Erwartet: dreimal true.
SELECT
  EXISTS (SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'objekt_exposes' AND column_name = 'wohnung_auswahl') AS spalte_wohnung_auswahl,
  EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'objekt_exposes_wohnung_auswahl_check') AS pruefregel_wohnung_auswahl,
  EXISTS (SELECT 1 FROM pg_trigger
           WHERE tgname = 'trg_objekt_exposes_kundenlink_nur_server'
             AND tgrelid = 'public.objekt_exposes'::regclass AND NOT tgisinternal) AS ausloeser_nur_server;
