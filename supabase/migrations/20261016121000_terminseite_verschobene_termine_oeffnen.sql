-- ===========================================================================
-- Terminseite: falsch verschobene, abgeschlossene Termine wieder oeffnen
-- ===========================================================================
--
-- AENDERT DATEN. Vorher ein Backup der Datenbank ziehen.
--
-- Bis 20261016120000 hat die Terminseite auch abgeschlossene Buchungen
-- ("wahrgenommen" oder "nicht erschienen") auf eine neue Zeit verschoben.
-- Gemeint war ein neuer Termin. Die Buchung stand danach auf der neuen Zeit,
-- war aber weiter abgeschlossen, ihre Verlaufszeile erledigt und ihre Aufgabe
-- erledigt oder abgesagt. In "Naechste Aktion" und in der Kontaktliste fehlte
-- der Termin.
--
-- WIE DIE FAELLE ERKANNT WERDEN
--
-- Buchung von der Terminseite (Link auf den externen Kalender), Status
-- abgeschlossen, Verlaufszeile erledigt, und die Buchung wurde mehr als eine
-- Minute nach dem Abschliessen noch einmal geaendert (`updated_at`). Nach dem
-- Abschliessen aendert sonst niemand eine Buchung: Der Status selbst setzt
-- `updated_at` und `erledigt_am` im selben Aufruf. Ausgelassen wird eine
-- Buchung, wenn es zu Kontakt, Gespraechsart und Zeit schon eine andere offene
-- Buchung gibt, sonst stuende der Termin doppelt da.
--
-- WAS GESCHIEHT
--
-- 1. Sicherung der betroffenen Buchungen, Verlaufszeilen und Aufgaben im
--    Originalzustand in drei Tabellen *_sicherung_20261016.
-- 2. Buchung zurueck auf 'offen'. Das loest keine Mail aus: Der Mail-Trigger
--    auf `buchungen` reagiert nur auf eine neue Zeit oder eine Absage.
-- 3. Verlaufszeile wieder offen (`erledigt_am` leer, ein "No-Show: " vorn im
--    Titel entfernt). Der Trigger `meeting_folgeobjekte` oeffnet dabei die
--    gekoppelte Aufgabe mit. Der Mail-Trigger der Verlaufszeile laesst
--    Buchungen aus.
-- 4. Gekoppelte Aufgabe ausdruecklich offen und auf die Zeit der Buchung,
--    falls der Trigger sie nicht erfasst hat.
--
-- Nichts wird geloescht, nichts verschickt. Der No-Show-Vermerk im Verlauf
-- und die Aufgabe "neu kontaktieren" bleiben stehen; sie gehoeren zum alten
-- Termin. Mehrfach ausfuehrbar: Ein zweiter Lauf findet nichts mehr.
--
-- ZAEHLEN (vorher, im SQL-Editor nur lesend):
--
--   SELECT count(*) AS betroffen
--   FROM public.buchungen b
--   JOIN public.buchung_links l ON l.id = b.link_id AND l.ziel = 'extern'
--   JOIN public.aktivitaeten a ON a.id = b.aktivitaet_id
--   WHERE b.status IN ('wahrgenommen', 'nicht_erschienen')
--     AND b.updated_at > CASE WHEN a.erledigt_am ~ '^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?)?(Z|[+-]\d{2}(:?\d{2})?)?$'
--                        THEN a.erledigt_am::timestamptz END + interval '1 minute'
--     AND NOT EXISTS (
--       SELECT 1 FROM public.buchungen d
--       WHERE d.id <> b.id AND d.status = 'offen'
--         AND d.kontakt_id = b.kontakt_id AND d.anlass = b.anlass
--         AND d.start_at = b.start_at
--     );
--
-- ZURUECKSETZEN bei Bedarf:
--
--   UPDATE public.buchungen x SET status = s.status
--   FROM public.buchungen_sicherung_20261016 s WHERE s.id = x.id;
--   UPDATE public.aktivitaeten x SET erledigt_am = s.erledigt_am, beschreibung = s.beschreibung
--   FROM public.aktivitaeten_sicherung_20261016 s WHERE s.id = x.id;
--   UPDATE public.aufgaben x SET status = s.status, erledigt_am = s.erledigt_am,
--     faellig_am = s.faellig_am, uhrzeit = s.uhrzeit
--   FROM public.aufgaben_sicherung_20261016 s WHERE s.id = x.id;
-- ===========================================================================

BEGIN;

CREATE TEMP TABLE _falsch_verschoben ON COMMIT DROP AS
SELECT b.id AS buchung_id, b.aktivitaet_id
FROM public.buchungen b
JOIN public.buchung_links l ON l.id = b.link_id AND l.ziel = 'extern'
JOIN public.aktivitaeten a ON a.id = b.aktivitaet_id
WHERE b.status IN ('wahrgenommen', 'nicht_erschienen')
  -- erledigt_am ist in aktivitaeten Text. Nur ein lesbarer Zeitpunkt wird
  -- umgewandelt, alles andere (leer, Unsinn) faellt heraus, statt den Lauf abzubrechen.
  AND b.updated_at > CASE WHEN a.erledigt_am ~ '^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?)?(Z|[+-]\d{2}(:?\d{2})?)?$'
                     THEN a.erledigt_am::timestamptz END + interval '1 minute'
  AND NOT EXISTS (
    SELECT 1 FROM public.buchungen d
    WHERE d.id <> b.id AND d.status = 'offen'
      AND d.kontakt_id = b.kontakt_id AND d.anlass = b.anlass
      AND d.start_at = b.start_at
  );

-- Sicherung. RLS an und keine Policy: ueber die API nicht lesbar.
-- IF NOT EXISTS: Ein zweiter Lauf ueberschreibt die erste Sicherung nicht.
CREATE TABLE IF NOT EXISTS public.buchungen_sicherung_20261016 AS
SELECT b.* FROM public.buchungen b
WHERE b.id IN (SELECT buchung_id FROM _falsch_verschoben);

CREATE TABLE IF NOT EXISTS public.aktivitaeten_sicherung_20261016 AS
SELECT a.* FROM public.aktivitaeten a
WHERE a.id IN (SELECT aktivitaet_id FROM _falsch_verschoben);

CREATE TABLE IF NOT EXISTS public.aufgaben_sicherung_20261016 AS
SELECT g.* FROM public.aufgaben g
WHERE g.meeting_aktivitaet_id IN (SELECT aktivitaet_id FROM _falsch_verschoben);

ALTER TABLE public.buchungen_sicherung_20261016 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aktivitaeten_sicherung_20261016 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aufgaben_sicherung_20261016 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.buchungen_sicherung_20261016 FROM anon, authenticated;
REVOKE ALL ON public.aktivitaeten_sicherung_20261016 FROM anon, authenticated;
REVOKE ALL ON public.aufgaben_sicherung_20261016 FROM anon, authenticated;

UPDATE public.buchungen b
SET status = 'offen'
WHERE b.id IN (SELECT buchung_id FROM _falsch_verschoben);

UPDATE public.aktivitaeten a
SET erledigt_am = NULL,
    beschreibung = regexp_replace(a.beschreibung, '^No-Show: ', '')
WHERE a.id IN (SELECT aktivitaet_id FROM _falsch_verschoben);

-- Zeit aus der Buchung, in der Zeitzone des Partners wie beim Eintragen.
UPDATE public.aufgaben g
SET status = 'offen',
    erledigt_am = NULL,
    faellig_am = b.start_at,
    uhrzeit = (b.start_at AT TIME ZONE COALESCE(e.zeitzone, 'Europe/Berlin'))::time,
    aktualisiert_am = now()
FROM _falsch_verschoben f
JOIN public.buchungen b ON b.id = f.buchung_id
LEFT JOIN public.buchung_einstellungen e ON e.mitarbeiter_id = b.mitarbeiter_id
WHERE g.meeting_aktivitaet_id = f.aktivitaet_id
  AND (g.status IS DISTINCT FROM 'offen'
       OR g.erledigt_am IS NOT NULL
       OR g.faellig_am IS DISTINCT FROM b.start_at);

COMMIT;
