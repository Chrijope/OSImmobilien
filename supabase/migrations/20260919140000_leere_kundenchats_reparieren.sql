-- ===========================================================================
-- Leere Kundenchats reparieren
-- ===========================================================================
--
-- WARUM
--
-- Am 19.09.2026 gemessen: zehn Chatgruppen vom Typ `kundenkommunikation`,
-- sechs davon ohne einen einzigen Teilnehmer. Die Schreibregel auf
-- `chat_nachrichten` verlangt, dass der Absender Teilnehmer ist. In diesen
-- sechs Gruppen konnte also niemand schreiben, weder der Kunde noch sein
-- Berater, und im Kundenportal tauchte der Chat gar nicht erst auf.
--
-- Die Ursache lag im Anlegen: Gruppe und Teilnehmerzeilen gingen ohne Warten
-- hinaus, obwohl die Zeilen per Fremdschluessel auf die Gruppe zeigen. Kam
-- eine Zeile zuerst an, lehnte Postgres sie ab. Behoben im selben Zug
-- (`createChat` in src/lib/chatStore.ts).
--
-- Interne Chats traf dasselbe, sie heilen sich aber beim naechsten Schreiben
-- selbst. Nur Kundenchats nicht, dort darf nicht jeder beitreten. Deshalb
-- stehen in der Messung bei `intern` und `direkt` saubere Nullen.
--
-- WER HIER EINGETRAGEN WIRD
--
-- Genau zwei Personen, und nur diese: der Kunde und der fuer ihn zustaendige
-- Berater. Ausdruecklich NICHT der urspruengliche Ersteller der Gruppe. Wer
-- den Chat vor Monaten angelegt hat, ist heute vielleicht gar nicht mehr
-- zustaendig, und ein Kundenchat ist kein Ort, an dem jemand aus Versehen
-- mitliest.
--
-- Der Berater kommt ueber `kontakte.zustaendig_id`, also ueber die KENNUNG.
-- Der Freitext `kontakte.berater` bleibt aussen vor. Im Projekt sind an vier
-- Stellen Personen ueber ihren Namen gesucht worden, und dahinter lagen zwei
-- Konten mit demselben Namen.
--
-- Gruppen, bei denen der Kunde noch keinen Portalzugang hat, bekommen nur den
-- Berater. Das ist richtig so: Ohne Zugang gibt es kein Konto, das man
-- eintragen koennte, und der Chat ist ohnehin gesperrt.
--
-- Wiederholbar: ein zweiter Lauf aendert nichts.
-- ===========================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Den Kunden eintragen
-- ---------------------------------------------------------------------------

INSERT INTO public.chat_teilnehmer (id, chat_id, benutzer_id, beigetreten_am, meta)
SELECT gen_random_uuid(),
       g.id,
       (k.meta->>'authUserId')::uuid,
       g.erstellt_am,
       jsonb_build_object(
         'name', btrim(concat_ws(' ', k.vorname, k.nachname)),
         'initials', upper(left(coalesce(k.vorname, ''), 1) || left(coalesce(k.nachname, ''), 1)),
         'role', 'Kunde')
  FROM public.chat_gruppen g
  JOIN public.kontakte k ON k.id::text = g.meta->>'kundeId'
 WHERE g.typ = 'kundenkommunikation'
   AND NOT EXISTS (SELECT 1 FROM public.chat_teilnehmer t WHERE t.chat_id = g.id)
   AND NULLIF(btrim(k.meta->>'authUserId'), '') IS NOT NULL
ON CONFLICT DO NOTHING;


-- ---------------------------------------------------------------------------
-- 2) Den zustaendigen Berater eintragen
-- ---------------------------------------------------------------------------
--
-- Die Bedingung prueft weiterhin auf "keine Teilnehmer ausser dem Kunden",
-- damit Abschnitt 1 und 2 unabhaengig voneinander wiederholbar bleiben.

INSERT INTO public.chat_teilnehmer (id, chat_id, benutzer_id, beigetreten_am, meta)
SELECT gen_random_uuid(),
       g.id,
       k.zustaendig_id,
       g.erstellt_am,
       jsonb_build_object(
         'name', coalesce(p.name, 'Dein Ansprechpartner'),
         'initials', upper(left(coalesce(p.name, 'A'), 1)),
         'role', 'Immobilienberater')
  FROM public.chat_gruppen g
  JOIN public.kontakte k ON k.id::text = g.meta->>'kundeId'
  LEFT JOIN public.profiles p ON p.id = k.zustaendig_id
 WHERE g.typ = 'kundenkommunikation'
   AND k.zustaendig_id IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM public.chat_teilnehmer t
      WHERE t.chat_id = g.id AND t.benutzer_id = k.zustaendig_id)
   AND NOT EXISTS (
     SELECT 1 FROM public.chat_teilnehmer t
      JOIN public.profiles pp ON pp.id = t.benutzer_id
     WHERE t.chat_id = g.id)
ON CONFLICT DO NOTHING;

COMMIT;


-- ---------------------------------------------------------------------------
-- 3) Nachsehen
-- ---------------------------------------------------------------------------
--
-- Wie viele Kundenchats haben jetzt noch keine Teilnehmer?
--
--     select g.typ,
--            count(*) filter (where t.anzahl is null or t.anzahl = 0) as ohne_teilnehmer,
--            count(*) as gesamt
--       from chat_gruppen g
--       left join (select chat_id, count(*) as anzahl
--                    from chat_teilnehmer group by chat_id) t on t.chat_id = g.id
--      group by g.typ;
--
-- Bleiben welche uebrig, fehlt dort entweder der Kontakt oder es ist kein
-- Berater zustaendig. Diese Abfrage zeigt, welcher Fall es ist:
--
--     select g.id, g.name, g.erstellt_am,
--            (k.id is null) as kontakt_fehlt,
--            (k.meta->>'authUserId' is null) as kunde_ohne_portal,
--            (k.zustaendig_id is null) as kein_berater
--       from chat_gruppen g
--       left join kontakte k on k.id::text = g.meta->>'kundeId'
--      where g.typ = 'kundenkommunikation'
--        and not exists (select 1 from chat_teilnehmer t where t.chat_id = g.id);
