-- ===========================================================================
-- Globalobjekt: eine Wahrheit. Anlageklasse und Schalter im Bestand angleichen
-- ===========================================================================
--
-- WARUM ES DIESE MIGRATION GIBT
--
--   Ob ein Objekt als Ganzes verkauft wird, stand an zwei Stellen: in der
--   Anlageklasse "Globalobjekt" (meta->>'anlageklasse') und im Schalter
--   global_objekt. Massgeblich fuer alles, was zaehlt (Hausreservierung,
--   Sperre einzelner Einheiten, Exposé des ganzen Hauses, Vermarktungsart in
--   der Portfoliokachel), ist der Schalter. Der Investagon-Import hat ihn aber
--   nie gesetzt. Deshalb zeigte die Kachel "Globalobjekt 2" unter den
--   Anlageklassen und unter der Vermarktungsart kein einziges.
--
--   Christians Entscheidung vom 23.09.2026: Der Schalter ist die eine
--   Wahrheit. Anlageklasse "Globalobjekt" und Schalter stimmen immer ueberein.
--   Fuer neue Aenderungen sorgen ab jetzt die Objektanlage und der Import
--   (Edge Function investagon-import, muss dafuer ausgerollt sein). Diese
--   Migration zieht den Bestand nach.
--
-- WAS SIE TUT
--
--   1. Objekte mit der Anlageklasse "Globalobjekt" (Schreibweise tolerant,
--      etwa "Global-Objekt") und ausgeschaltetem Schalter bekommen den
--      Schalter. Das gilt fuer Investagon-Objekte und fuer von Hand angelegte.
--      Bei Investagon-Objekten taete das der naechste Abgleich ohnehin; die
--      Migration macht es sofort, auch fuer Objekte, die Investagon gerade
--      nicht liefert.
--   2. Von Hand angelegte Objekte mit eingeschaltetem Schalter, deren
--      Anlageklasse etwas anderes nennt, bekommen die Anlageklasse
--      "Globalobjekt". Die bisherige Klasse bleibt unter
--      meta->'anlageklasseVorAngleich' stehen. Investagon-Objekte fasst dieser
--      Schritt nicht an: Dort fuehrt Investagon die Klasse, und der Import
--      stellt den Schalter danach. Erwartet sind hier 0 Zeilen, die Kachel
--      zeigte kein einziges Globalobjekt.
--
--   Jede geaenderte Zeile traegt den Vermerk meta->'globalobjektAngeglichenAm'.
--   An wohnungen aendert diese Migration nichts.
--
-- WAS DARAUS FOLGT (Schritt 1)
--
--   Ein Objekt, das dadurch zum Globalobjekt wird, wird nur noch als Ganzes
--   reserviert, ueber "Haus fuer Kunden reservieren" auf der Objektseite
--   (braucht 20260923152000_globalobjekt_reservierung.sql). Einzelne Einheiten
--   lassen sich nicht mehr reservieren: Das CRM zeigt den Knopf nicht mehr,
--   und die Datenbank lehnt eine neue Einheitsreservierung ab
--   (wohnung_reservierung_pruefen, seit 20260923150000). Bestehende
--   Einheitsreservierungen bleiben, wie sie sind. Die Pruefabfrage unten
--   zeigt je Objekt, wie viele Einheiten schon einen Kunden haben.
--   Ausserdem springt ein Klick in der Objektliste nicht mehr direkt in die
--   Einheit, sondern auf die Objektseite des Hauses.
--
-- VORHER ANSEHEN (lesend, aendert nichts; nur Titel und Kennung, keine Kunden)
--
--   select o.id,
--          o.titel,
--          case when o.meta->>'investagonSlug' is not null then 'Investagon' else 'von Hand' end as herkunft,
--          o.meta->>'anlageklasse' as anlageklasse,
--          coalesce(o.global_objekt, false) as schalter,
--          case when coalesce(o.global_objekt, false)
--               then 'Anlageklasse wird Globalobjekt'
--               else 'Schalter wird gesetzt' end as aenderung,
--          (select count(*) from public.wohnungen w
--            where w.objekt_id = o.id and w.kunde_id is not null) as einheiten_mit_kunde
--     from public.objekte o
--    where (regexp_replace(lower(coalesce(o.meta->>'anlageklasse', '')), '[^a-zäöüß]', '', 'g')
--             in ('globalobjekt', 'globalobjekte')
--           and not coalesce(o.global_objekt, false))
--       or (coalesce(o.global_objekt, false)
--           and o.meta->>'investagonSlug' is null
--           and regexp_replace(lower(coalesce(o.meta->>'anlageklasse', '')), '[^a-zäöüß]', '', 'g')
--             not in ('globalobjekt', 'globalobjekte'))
--    order by o.titel;
--
-- ZURUECKDREHEN (falls noetig, in dieser Reihenfolge)
--
--   update public.objekte
--      set meta = (meta - 'anlageklasseVorAngleich' - 'globalobjektAngeglichenAm')
--                 || jsonb_build_object('anlageklasse', meta->>'anlageklasseVorAngleich')
--    where meta ? 'anlageklasseVorAngleich';
--
--   update public.objekte
--      set global_objekt = false,
--          meta = meta - 'globalobjektAngeglichenAm'
--    where meta ? 'globalobjektAngeglichenAm';
--
-- WIEDERHOLBAR
--
--   Beide Schritte greifen nur, wo Anlageklasse und Schalter noch
--   auseinanderliegen. Beim zweiten Lauf aendert sich nichts. Unabhaengig
--   davon, ob 20260923150000 und 20260923152000 schon gelaufen sind: Beruehrt
--   werden nur global_objekt und meta, nicht die Spalten der Reservierung.
-- ===========================================================================


-- 1) Anlageklasse "Globalobjekt" ohne Schalter: Schalter setzen.
UPDATE public.objekte o
   SET global_objekt = true,
       meta = coalesce(o.meta, '{}'::jsonb)
              || jsonb_build_object('globalobjektAngeglichenAm', to_char(now(), 'YYYY-MM-DD'))
 WHERE regexp_replace(lower(coalesce(o.meta->>'anlageklasse', '')), '[^a-zäöüß]', '', 'g')
         IN ('globalobjekt', 'globalobjekte')
   AND NOT coalesce(o.global_objekt, false);


-- 2) Von Hand angelegt, Schalter an, andere Klasse: Klasse "Globalobjekt".
UPDATE public.objekte o
   SET meta = coalesce(o.meta, '{}'::jsonb)
              || jsonb_build_object(
                   'anlageklasseVorAngleich', coalesce(o.meta->>'anlageklasse', ''),
                   'anlageklasse', 'Globalobjekt',
                   'globalobjektAngeglichenAm', to_char(now(), 'YYYY-MM-DD'))
 WHERE coalesce(o.global_objekt, false)
   AND o.meta->>'investagonSlug' IS NULL
   AND regexp_replace(lower(coalesce(o.meta->>'anlageklasse', '')), '[^a-zäöüß]', '', 'g')
         NOT IN ('globalobjekt', 'globalobjekte');


-- Zum Schluss: der Stand danach. Erwartet: abweichend = 0.
SELECT count(*) FILTER (WHERE coalesce(global_objekt, false)) AS globalobjekte,
       count(*) FILTER (WHERE regexp_replace(lower(coalesce(meta->>'anlageklasse', '')), '[^a-zäöüß]', '', 'g')
                              IN ('globalobjekt', 'globalobjekte')) AS anlageklasse_globalobjekt,
       count(*) FILTER (WHERE meta ? 'globalobjektAngeglichenAm') AS angeglichen,
       count(*) FILTER (WHERE
         (regexp_replace(lower(coalesce(meta->>'anlageklasse', '')), '[^a-zäöüß]', '', 'g')
            IN ('globalobjekt', 'globalobjekte')) <> coalesce(global_objekt, false)
         AND NOT (coalesce(global_objekt, false) AND meta->>'investagonSlug' IS NOT NULL)) AS abweichend
  FROM public.objekte;
