-- Doppelte automatische Aufgaben schliessen.
--
-- Automatische Aufgaben tragen einen Ausloeser-Schluessel, etwa
-- "kaufpreis:2w:<investment>". Zu einem Schluessel gehoert genau eine Aufgabe.
--
-- Zwei Fehler haben trotzdem Dubletten erzeugt:
--
--   Die Spalte ausloeser_schluessel fehlte in der Datenbank, solange die
--   Migration 20260727130000 nicht gelaufen war. Ohne sie konnte der Code eine
--   bestehende Aufgabe nicht wiedererkennen und legte bei jedem Durchlauf eine
--   neue an.
--
--   Und die Pruefung lief nur ueber die eigenen Aufgaben. Buchhaltung, Admin
--   und Inhaber haben denselben Ausloeser, bekamen die Aufgabe also je einmal.
--
-- Beides ist im Code behoben. Diese Migration raeumt auf, was bis dahin
-- entstanden ist: Je Schluessel bleibt die aelteste offene Aufgabe stehen,
-- alle spaeteren werden auf erledigt gesetzt. Geloescht wird nichts, damit die
-- Historie nachvollziehbar bleibt.

WITH rang AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY ausloeser_schluessel
      ORDER BY erstellt_am ASC, id ASC
    ) AS platz
  FROM public.aufgaben
  WHERE ausloeser_schluessel IS NOT NULL
    AND status NOT IN ('erledigt', 'abgesagt')
)
UPDATE public.aufgaben a
SET status = 'erledigt',
    erledigt_am = now()
FROM rang
WHERE a.id = rang.id
  AND rang.platz > 1;

-- Und die Spuren im Protokoll aufraeumen.
--
-- Jede angelegte Aufgabe erzeugt einen Eintrag in activity_log. Bei Otto Hans
-- standen dadurch acht identische Zeilen "Aufgabe angelegt: Kaufpreis-
-- faelligkeit pruefen" im Kundenprofil, alle vom selben Tag.
--
-- Geloescht werden ausschliesslich Protokollzeilen, die zu einer Aufgabe mit
-- Ausloeser-Schluessel gehoeren und deren Vorgang bereits eine aeltere,
-- gleichlautende Zeile am selben Kontakt hat. Die erste bleibt stehen, damit
-- nachvollziehbar bleibt, wann die Aufgabe entstanden ist.

WITH protokoll AS (
  SELECT
    l.id,
    ROW_NUMBER() OVER (
      PARTITION BY l.kontakt_id, l.meta->>'titel'
      ORDER BY l.created_at ASC, l.id ASC
    ) AS platz
  FROM public.activity_log l
  WHERE l.action = 'aufgabe_created'
    AND l.meta->>'titel' IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.aufgaben a
      WHERE a.kontakt_id = l.kontakt_id
        AND a.titel = l.meta->>'titel'
        AND a.ausloeser_schluessel IS NOT NULL
    )
)
DELETE FROM public.activity_log l
USING protokoll
WHERE l.id = protokoll.id
  AND protokoll.platz > 1;
