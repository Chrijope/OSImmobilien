-- ===========================================================================
-- Prueflauf: Wie oft geht die Partnersuche ueber den Namen daneben?
-- ===========================================================================
--
-- Diese Datei aendert NICHTS. Sie ist eine reine Abfrage und darf beliebig
-- oft laufen. Sie schlaegt auch keine Korrektur vor.
--
-- WORUM ES GEHT
--
-- Ein Kontakt traegt den zustaendigen Partner zweimal: als Freitext im Feld
-- `berater` und als echte Kennung in `zustaendig_id`. Die Kennung ist
-- verlaesslich, der Name nicht. Trotzdem sucht `investment_partner_id` bis
-- heute zuerst ueber den Namen, und zwar exakt:
--
--     SELECT p.id INTO _partner FROM public.profiles p
--      WHERE p.name = _berater LIMIT 1;
--
-- Daran haengen zwei Fehler auf einmal:
--
--   1. Findet der Vergleich nichts, weil eine Schreibweise abweicht, faellt
--      die Funktion auf `zustaendig_id` zurueck. Ist das eine andere Person,
--      wird der Partner am Investment falsch gesetzt, und an diesem Partner
--      haengt der festgeschriebene Provisionssatz.
--   2. Passt der Name auf mehrere Profile, nimmt `LIMIT 1` irgendeines.
--
-- Bevor daran etwas berichtigt wird, soll erst einmal dastehen, ob es das
-- Problem im Bestand ueberhaupt gibt und wie gross es ist.
--
-- WAS DIE ZEILEN BEDEUTEN
--
--   1  Grundgesamtheit: Kontakte mit einem eingetragenen Berater-Namen.
--   2  Bei diesen findet die heutige exakte Suche kein Profil. Die Funktion
--      faellt auf `zustaendig_id` zurueck.
--   3  Teilmenge von 2: Es gaebe sehr wohl genau ein passendes Profil, wenn
--      Gross- und Kleinschreibung und Randleerzeichen egal waeren. Das sind
--      die Treffer, die die heutige Suche unnoetig verfehlt.
--   4  DER SCHADENSFALL. Die heutige Suche findet ueber den Namen eine
--      Person, und das ist NICHT die Person in `zustaendig_id`. Hier setzt
--      die Funktion den Partner heute anders, als die Kennung es sagt.
--   5  Der Name passt auf mehrere Profile. Jede Zuordnung waere geraten.
--   6  Kontakte ganz ohne `zustaendig_id`. Dort bleibt der Name der einzige
--      Anhaltspunkt, auch nach der Reparatur.
--   7  So viele Investments haengen an den Kontakten aus Zeile 4. Das ist
--      die Zahl, an der die Provision haengt.
--   8  So viele Namen sind unter den Profilen mehr als einmal vergeben.
--
-- Erwartung, wenn alles sauber ist: Zeile 4 und Zeile 7 stehen auf 0.
-- ===========================================================================

WITH kontakt AS (
  SELECT
    k.id,
    k.berater                                                      AS roh,
    k.zustaendig_id,
    regexp_replace(lower(btrim(k.berater)), '\s+', ' ', 'g')        AS norm
  FROM public.kontakte k
  WHERE btrim(coalesce(k.berater, '')) <> ''
),
treffer AS (
  SELECT
    ko.id,
    ko.zustaendig_id,
    -- So sucht die Funktion HEUTE: exakter Vergleich auf den rohen Wert.
    (SELECT p.id
       FROM public.profiles p
      WHERE p.name = ko.roh
      LIMIT 1)                                                     AS heute_id,
    -- So wuerde sie NACH der Reparatur suchen: Gross- und Kleinschreibung
    -- sowie Randleerzeichen egal, und nur ein einziger Treffer zaehlt.
    (SELECT count(*)
       FROM public.profiles p
      WHERE regexp_replace(lower(btrim(coalesce(p.name, ''))), '\s+', ' ', 'g') = ko.norm)
                                                                   AS tolerant_anzahl
  FROM kontakt ko
),
gleichnamig AS (
  SELECT regexp_replace(lower(btrim(coalesce(p.name, ''))), '\s+', ' ', 'g') AS norm
  FROM public.profiles p
  WHERE btrim(coalesce(p.name, '')) <> ''
  GROUP BY 1
  HAVING count(*) > 1
)
SELECT * FROM (
  SELECT 1 AS nr,
         'Kontakte mit eingetragenem Berater-Namen' AS frage,
         count(*) AS anzahl
    FROM treffer

  UNION ALL
  SELECT 2,
         'davon: heutige exakte Suche findet kein Profil',
         count(*)
    FROM treffer WHERE heute_id IS NULL

  UNION ALL
  SELECT 3,
         'davon: es gaebe genau ein Profil bei toleranter Suche',
         count(*)
    FROM treffer WHERE heute_id IS NULL AND tolerant_anzahl = 1

  UNION ALL
  SELECT 4,
         'SCHADENSFALL: Namenstreffer weicht von zustaendig_id ab',
         count(*)
    FROM treffer
   WHERE heute_id IS NOT NULL
     AND zustaendig_id IS NOT NULL
     AND heute_id <> zustaendig_id

  UNION ALL
  SELECT 5,
         'Name passt auf mehrere Profile, Zuordnung waere geraten',
         count(*)
    FROM treffer WHERE tolerant_anzahl > 1

  UNION ALL
  SELECT 6,
         'Kontakte ohne zustaendig_id, nur der Name bleibt',
         count(*)
    FROM treffer WHERE zustaendig_id IS NULL

  UNION ALL
  SELECT 7,
         'Investments an den Faellen aus Zeile 4',
         count(*)
    FROM public.investments i
    JOIN treffer t ON t.id = i.kunde_id
   WHERE t.heute_id IS NOT NULL
     AND t.zustaendig_id IS NOT NULL
     AND t.heute_id <> t.zustaendig_id

  UNION ALL
  SELECT 8,
         'Namen, die unter den Profilen mehrfach vergeben sind',
         count(*)
    FROM gleichnamig
) AS befund
ORDER BY nr;

-- ---------------------------------------------------------------------------
-- Wenn eine Zeile auffaellt: die Einzelfaelle dazu
-- ---------------------------------------------------------------------------
--
-- ACHTUNG: Die folgenden Abfragen geben echte Namen aus. Sie sind zum
-- Nachsehen in Lovable gedacht, nicht zum Weiterreichen. Bitte das Ergebnis
-- nicht in einen Chat kopieren, es sind personenbezogene Daten.
--
-- Die Faelle aus Zeile 4:
--
--   SELECT k.id, k.berater, k.zustaendig_id
--     FROM public.kontakte k
--    WHERE btrim(coalesce(k.berater, '')) <> ''
--      AND k.zustaendig_id IS NOT NULL
--      AND EXISTS (
--            SELECT 1 FROM public.profiles p
--             WHERE p.name = k.berater AND p.id <> k.zustaendig_id)
--    ORDER BY k.berater;
--
-- Die Schreibweisen aus Zeile 3, also was die heutige Suche verfehlt:
--
--   SELECT DISTINCT k.berater AS so_steht_es_am_kontakt
--     FROM public.kontakte k
--    WHERE btrim(coalesce(k.berater, '')) <> ''
--      AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.name = k.berater)
--      AND EXISTS (
--            SELECT 1 FROM public.profiles p
--             WHERE regexp_replace(lower(btrim(coalesce(p.name, ''))), '\s+', ' ', 'g')
--                 = regexp_replace(lower(btrim(k.berater)), '\s+', ' ', 'g'))
--    ORDER BY 1;
--
-- Die Gleichnamigen aus Zeile 8:
--
--   SELECT regexp_replace(lower(btrim(coalesce(p.name, ''))), '\s+', ' ', 'g') AS name_norm,
--          count(*) AS profile
--     FROM public.profiles p
--    WHERE btrim(coalesce(p.name, '')) <> ''
--    GROUP BY 1
--   HAVING count(*) > 1
--    ORDER BY 2 DESC;
