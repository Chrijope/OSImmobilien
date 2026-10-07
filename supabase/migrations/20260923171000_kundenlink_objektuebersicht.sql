-- ===========================================================================
-- Kundenlink: Art (Exposé oder Objektübersicht) und Einstiegswohnung
-- ===========================================================================
--
-- WARUM ES DIESE MIGRATION GIBT
--
--   Seit dem 23.09.2026 gibt es einen Knopf „Kundenlink senden“ (Bauplan
--   Kundenansicht, Teil 2, Freigabe von Christian). Im Fenster wählt man:
--     - „Objektübersicht mit allen freien Wohnungen“ (Standard): EIN Link je
--       Kunde, Investment und Haus. Er öffnet die Wohnung, aus der er
--       gesendet wurde, und der Kunde kann alle freien Wohnungen des Hauses
--       ansehen. Adresse: https://portal.more.immo/immobilie/<token>
--     - „nur Exposé dieser Wohnung“: wie bisher je Einheit,
--       https://portal.more.immo/expose/<objekt>/wohnung/<einheit>?token=…
--   Beides liegt in derselben Tabelle `objekt_exposes`, damit Versand, Liste
--   „Gesendete Links“, Frist, Zähler, Glocke und Zurückziehen nur einmal
--   existieren.
--
-- WAS SIE TUT
--
--   1. Spalte `art`: 'expose' oder 'objektuebersicht', Standard 'expose'.
--      Alle vorhandenen Zeilen werden damit zu 'expose', so wie sie gemeint
--      waren. Eine Prüfregel lässt nur diese beiden Werte zu.
--   2. Spalte `einstieg_wohnung_id`: bei der Objektübersicht die Wohnung, bei
--      der der Link öffnet. Wird die Wohnung gelöscht, wird der Verweis leer,
--      die Übersicht öffnet dann beim Haus. `wohnung_id` bleibt bei der
--      Objektübersicht leer, denn die Zeile gehört zum ganzen Haus.
--   3. Index je Kunde, Investment, Objekt und Art für die Suche beim Senden.
--   4. Eindeutig: je Kunde, Investment und Objekt höchstens EINE nicht
--      zurückgezogene Objektübersicht. Erneut senden aus einer anderen
--      Wohnung setzt nur die Einstiegswohnung neu und verlängert die Frist,
--      es entsteht kein zweiter Link. Ein zurückgezogener Link bleibt tot;
--      wer danach sendet, bekommt eine neue Zeile mit neuem Schlüssel.
--
-- VORAUSSETZUNG
--
--   20260923151000_kunden_expose_versand.sql muss vorher gelaufen sein
--   (Spalten `investment_id`, `gesendet_am`, `zurueckgezogen_am`). Fehlt
--   sie, bricht diese Migration gleich am Anfang mit einem klaren Satz ab und
--   ändert nichts.
--
-- OHNE DIESE MIGRATION
--
--   Das CRM läuft weiter. Das Exposé geht wie bisher hinaus. Nur das Senden
--   der Objektübersicht antwortet mit „Migration Kundenlink noch nicht
--   ausgeführt“, bevor irgendetwas geschrieben oder verschickt wird.
--
-- VORHER ANSEHEN (lesend, ändert nichts; keine Namen, nur Zahlen)
--
--   select count(*) as zeilen,
--          count(*) filter (where gesendet_am is not null) as gesendet
--     from public.objekt_exposes;
--
-- ZURÜCKDREHEN (falls nötig)
--
--   drop index if exists public.objekt_exposes_objektuebersicht_eindeutig;
--   drop index if exists public.objekt_exposes_kundenlink_idx;
--   alter table public.objekt_exposes drop constraint if exists objekt_exposes_art_check;
--   alter table public.objekt_exposes drop column if exists einstieg_wohnung_id;
--   alter table public.objekt_exposes drop column if exists art;
--
--   Achtung: Danach wären gesendete Objektübersichten nicht mehr von
--   Exposés zu unterscheiden. Vorher also zurückziehen oder löschen.
--
-- WIEDERHOLBAR
--
--   Alles mit IF NOT EXISTS oder vorheriger Prüfung. Ein zweiter Lauf ändert
--   nichts.
-- ===========================================================================


-- 0) Voraussetzung prüfen, bevor irgendetwas geändert wird.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'objekt_exposes'
       AND column_name = 'zurueckgezogen_am'
  ) THEN
    RAISE EXCEPTION 'Zuerst 20260923151000_kunden_expose_versand.sql ausführen, dann diese Migration.';
  END IF;
END $$;


-- 1) und 2) Die beiden neuen Spalten.
ALTER TABLE public.objekt_exposes
  ADD COLUMN IF NOT EXISTS art text NOT NULL DEFAULT 'expose',
  ADD COLUMN IF NOT EXISTS einstieg_wohnung_id uuid REFERENCES public.wohnungen(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'objekt_exposes_art_check'
  ) THEN
    ALTER TABLE public.objekt_exposes
      ADD CONSTRAINT objekt_exposes_art_check
      CHECK (art IN ('expose', 'objektuebersicht'));
  END IF;
END $$;


-- 3) Suche beim Senden: gibt es für diesen Kunden, dieses Investment und
--    dieses Objekt schon einen Link dieser Art?
CREATE INDEX IF NOT EXISTS objekt_exposes_kundenlink_idx
  ON public.objekt_exposes (kontakt_id, investment_id, objekt_id, art);


-- 4) Höchstens eine lebende Objektübersicht je Kunde, Investment und Objekt.
--    Fängt auch zwei gleichzeitige Klicks ab; `send-kunden-expose` nimmt
--    dann die schon angelegte Zeile.
CREATE UNIQUE INDEX IF NOT EXISTS objekt_exposes_objektuebersicht_eindeutig
  ON public.objekt_exposes (kontakt_id, investment_id, objekt_id)
  WHERE art = 'objektuebersicht' AND zurueckgezogen_am IS NULL;


COMMENT ON COLUMN public.objekt_exposes.art IS
  'expose: Exposé einer Einheit oder des ganzen Objekts. objektuebersicht: Kundenansicht des Hauses mit allen freien Wohnungen, ein Link je Kunde, Investment und Objekt.';
COMMENT ON COLUMN public.objekt_exposes.einstieg_wohnung_id IS
  'Nur bei der Objektübersicht: Wohnung, bei der der Link öffnet. Leer: Hausebene.';


-- Zum Schluss: der Stand danach. Erwartet: fünfmal true, objektuebersicht = 0.
SELECT
  EXISTS (SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'objekt_exposes' AND column_name = 'art') AS spalte_art,
  EXISTS (SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'objekt_exposes' AND column_name = 'einstieg_wohnung_id') AS spalte_einstieg,
  EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'objekt_exposes_art_check') AS pruefregel_art,
  EXISTS (SELECT 1 FROM pg_indexes
           WHERE schemaname = 'public' AND indexname = 'objekt_exposes_kundenlink_idx') AS index_kundenlink,
  EXISTS (SELECT 1 FROM pg_indexes
           WHERE schemaname = 'public' AND indexname = 'objekt_exposes_objektuebersicht_eindeutig') AS index_eindeutig,
  (SELECT count(*) FROM public.objekt_exposes WHERE art = 'expose') AS expose,
  (SELECT count(*) FROM public.objekt_exposes WHERE art = 'objektuebersicht') AS objektuebersicht;
