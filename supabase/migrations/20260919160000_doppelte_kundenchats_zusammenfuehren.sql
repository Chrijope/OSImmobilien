-- ===========================================================================
-- Doppelte Kundenchats zusammenfuehren
-- ===========================================================================
--
-- WAS PASSIERT IST
--
-- Bei einem Testkunden zeigte der Reiter "Kommunikation" die Zahl 2, der Kundenchat
-- darunter war aber leer, und der Berater bekam beim Senden die Meldung, die
-- Nachricht sei nicht gesendet worden. Im Kundenportal standen gleichzeitig
-- zwei Nachrichten des Kunden, die er selbst geschrieben hatte.
--
-- Der Grund: Es gibt zu diesem Kunden MEHR ALS EINE Chatgruppe vom Typ
-- `kundenkommunikation`. Der Zaehler
-- (`getUnreadChatCountForKunde` in src/lib/chatStore.ts) geht ueber ALLE
-- Gruppen des Kunden. Die Anzeige darunter nimmt nur EINE. Der Kunde schrieb
-- also in die eine, der Berater sah die andere.
--
-- Deshalb verschwand die Zahl auch nie: Man kann eine Nachricht nicht lesen,
-- die einem gar nicht gezeigt wird.
--
-- WOHER DIE ZWEITE GRUPPE KAM
--
-- Bis zum 19.09.2026 legte jeder Klick auf "Chat starten" im Kundenportal
-- eine neue Gruppe an, ohne nachzusehen, ob es schon eine gibt. Behoben mit
-- `20260919150000_kundenchat_starten.sql`. Diese Migration raeumt auf, was
-- bis dahin entstanden ist.
--
-- WAS SIE TUT
--
-- Je Kunde bleibt die AELTESTE Gruppe. Sie ist die richtige Wahl, weil
-- `kundenchat_starten` und die Oberflaeche seit heute ebenfalls die aelteste
-- nehmen. Alles aus den juengeren wandert hinueber:
--
--   1. Nachrichten, mit Absender, Zeitpunkt und Lesestand.
--   2. Teilnehmer, sofern sie in der aelteren noch fehlen.
--
-- Erst danach werden die leeren juengeren Gruppen geloescht. Es geht dabei
-- KEINE Nachricht verloren; das Loeschen trifft nur Gruppen, aus denen vorher
-- alles umgehaengt wurde.
--
-- Anhaenge liegen unter `chat/<Chatkennung>/` im Ablageort. Sie werden NICHT
-- verschoben, und ihre Nachrichten verweisen weiterhin auf die alte Kennung.
-- Das ist Absicht: Dateien im Speicher umzubenennen ist ein Eingriff eigener
-- Art, und die Verweise funktionieren unveraendert weiter.
--
-- Wiederholbar: ein zweiter Lauf findet nichts mehr zu tun.
-- ===========================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Nachrichten in die aelteste Gruppe umhaengen
-- ---------------------------------------------------------------------------

WITH gruppen AS (
  SELECT g.id,
         g.meta->>'kundeId' AS kunde_id,
         first_value(g.id) OVER (
           PARTITION BY g.meta->>'kundeId'
           ORDER BY g.erstellt_am, g.id
         ) AS behalten
    FROM public.chat_gruppen g
   WHERE g.typ = 'kundenkommunikation'
     AND NULLIF(btrim(g.meta->>'kundeId'), '') IS NOT NULL
)
UPDATE public.chat_nachrichten n
   SET chat_id = gruppen.behalten
  FROM gruppen
 WHERE n.chat_id = gruppen.id
   AND gruppen.id <> gruppen.behalten;


-- ---------------------------------------------------------------------------
-- 2) Teilnehmer nachtragen, die nur in einer juengeren Gruppe standen
-- ---------------------------------------------------------------------------

WITH gruppen AS (
  SELECT g.id,
         first_value(g.id) OVER (
           PARTITION BY g.meta->>'kundeId'
           ORDER BY g.erstellt_am, g.id
         ) AS behalten
    FROM public.chat_gruppen g
   WHERE g.typ = 'kundenkommunikation'
     AND NULLIF(btrim(g.meta->>'kundeId'), '') IS NOT NULL
)
INSERT INTO public.chat_teilnehmer (chat_id, benutzer_id, beigetreten_am, meta)
SELECT DISTINCT ON (gruppen.behalten, t.benutzer_id)
       gruppen.behalten, t.benutzer_id, t.beigetreten_am, t.meta
  FROM public.chat_teilnehmer t
  JOIN gruppen ON gruppen.id = t.chat_id
 WHERE gruppen.id <> gruppen.behalten
   AND NOT EXISTS (
     SELECT 1 FROM public.chat_teilnehmer vorhanden
      WHERE vorhanden.chat_id = gruppen.behalten
        AND vorhanden.benutzer_id = t.benutzer_id)
ON CONFLICT DO NOTHING;


-- ---------------------------------------------------------------------------
-- 3) Die leeren juengeren Gruppen entfernen
-- ---------------------------------------------------------------------------
--
-- Die Sicherheitsbedingung ist wichtig: geloescht wird nur, was WIRKLICH
-- keine Nachricht mehr traegt. Sollte Schritt 1 aus irgendeinem Grund nicht
-- vollstaendig durchgelaufen sein, bleibt die Gruppe lieber stehen.

WITH gruppen AS (
  SELECT g.id,
         first_value(g.id) OVER (
           PARTITION BY g.meta->>'kundeId'
           ORDER BY g.erstellt_am, g.id
         ) AS behalten
    FROM public.chat_gruppen g
   WHERE g.typ = 'kundenkommunikation'
     AND NULLIF(btrim(g.meta->>'kundeId'), '') IS NOT NULL
)
DELETE FROM public.chat_gruppen z
 USING gruppen
 WHERE z.id = gruppen.id
   AND gruppen.id <> gruppen.behalten
   AND NOT EXISTS (SELECT 1 FROM public.chat_nachrichten n WHERE n.chat_id = z.id);

COMMIT;


-- ---------------------------------------------------------------------------
-- 4) Nachsehen
-- ---------------------------------------------------------------------------
--
-- Gibt es noch einen Kunden mit mehreren Kundenchats?
--
--     select meta->>'kundeId' as kunde, count(*) as gruppen
--       from chat_gruppen
--      where typ = 'kundenkommunikation'
--      group by meta->>'kundeId'
--     having count(*) > 1;
--
-- Erwartet: keine Zeile.
--
-- Und wie sieht der Chat von einem Testkunden jetzt aus?
--
--     select g.id, g.erstellt_am,
--            (select count(*) from chat_teilnehmer t where t.chat_id = g.id) as teilnehmer,
--            (select count(*) from chat_nachrichten n where n.chat_id = g.id) as nachrichten
--       from chat_gruppen g
--       join kontakte k on k.id::text = g.meta->>'kundeId'
--      where g.typ = 'kundenkommunikation'
--        and lower(btrim(concat_ws(' ', k.vorname, k.nachname))) = 'otto hans';
--
-- Erwartet: eine Zeile, zwei Teilnehmer, die Nachrichten beider Gruppen.
