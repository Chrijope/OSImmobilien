-- ===========================================================================
-- In jedem Kundenchat sitzen der Kunde und sein Berater
-- ===========================================================================
--
-- WARUM NOCH EINMAL
--
-- `20260919140000_leere_kundenchats_reparieren.sql` sollte das schon tun, war
-- aber zu vorsichtig geschrieben: Sie trug nur dort nach, wo GAR KEIN
-- Teilnehmer stand. Sass in einer Gruppe bereits irgendjemand, blieb sie
-- unberuehrt, auch wenn genau der Berater fehlte.
--
-- Genau dieser Fall lag bei einem Testkunden vor, und er erklaert drei Symptome auf
-- einmal:
--
--   1. Der Berater konnte nicht antworten. Die Schreibregel auf
--      `chat_nachrichten` verlangt, dass der Absender Teilnehmer ist.
--   2. In der Seitenleiste blieb der Zaehler bei Chat leer. Er geht ueber die
--      Chats, in denen man Teilnehmer IST (`getUnreadChatCount`).
--   3. Im Kundenprofil erschien die Zahl trotzdem, denn dort wird ueber den
--      Kunden gezaehlt und nicht ueber die Teilnahme.
--
-- Ein Kundenchat ohne seinen Berater ist kein Chat, sondern ein Briefkasten
-- ohne Schluessel.
--
-- WAS SIE TUT
--
-- Ohne Wenn und Aber: In jeder Gruppe vom Typ `kundenkommunikation` werden
-- der Kunde und der fuer ihn zustaendige Berater eingetragen, falls sie
-- fehlen. Wer sonst noch drinsitzt, bleibt unberuehrt; niemand wird entfernt.
--
-- Der Berater kommt ueber `kontakte.zustaendig_id`, also ueber die KENNUNG.
-- Der Freitext `kontakte.berater` bleibt aussen vor: Im Projekt sind an vier
-- Stellen Personen ueber ihren Namen gesucht worden, und dahinter lagen zwei
-- Konten mit demselben Namen.
--
-- Wiederholbar: ein zweiter Lauf findet nichts mehr zu tun.
-- ===========================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Der Kunde, sofern er einen Portalzugang hat
-- ---------------------------------------------------------------------------

INSERT INTO public.chat_teilnehmer (chat_id, benutzer_id, beigetreten_am, meta)
SELECT g.id,
       (k.meta->>'authUserId')::uuid,
       g.erstellt_am,
       jsonb_build_object(
         'name', btrim(concat_ws(' ', k.vorname, k.nachname)),
         'initials', upper(left(coalesce(k.vorname, 'K'), 1) || left(coalesce(k.nachname, ''), 1)),
         'role', 'Kunde')
  FROM public.chat_gruppen g
  JOIN public.kontakte k ON k.id::text = g.meta->>'kundeId'
 WHERE g.typ = 'kundenkommunikation'
   AND NULLIF(btrim(k.meta->>'authUserId'), '') IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM public.chat_teilnehmer t
      WHERE t.chat_id = g.id
        AND t.benutzer_id = (k.meta->>'authUserId')::uuid)
ON CONFLICT DO NOTHING;


-- ---------------------------------------------------------------------------
-- 2) Der zustaendige Berater
-- ---------------------------------------------------------------------------

INSERT INTO public.chat_teilnehmer (chat_id, benutzer_id, beigetreten_am, meta)
SELECT g.id,
       k.zustaendig_id,
       g.erstellt_am,
       jsonb_build_object(
         'name', coalesce(p.name, 'Dein Ansprechpartner'),
         'initials', upper(left(coalesce(p.name, 'B'), 1)),
         'role', 'Immobilienberater')
  FROM public.chat_gruppen g
  JOIN public.kontakte k ON k.id::text = g.meta->>'kundeId'
  LEFT JOIN public.profiles p ON p.id = k.zustaendig_id
 WHERE g.typ = 'kundenkommunikation'
   AND k.zustaendig_id IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM public.chat_teilnehmer t
      WHERE t.chat_id = g.id
        AND t.benutzer_id = k.zustaendig_id)
ON CONFLICT DO NOTHING;

COMMIT;


-- ---------------------------------------------------------------------------
-- 3) Nachsehen
-- ---------------------------------------------------------------------------
--
-- Fehlt irgendwo noch jemand?
--
--     select g.id,
--            btrim(concat_ws(' ', k.vorname, k.nachname)) as kunde,
--            (select count(*) from chat_teilnehmer t where t.chat_id = g.id) as teilnehmer,
--            exists (select 1 from chat_teilnehmer t
--                     where t.chat_id = g.id and t.benutzer_id = k.zustaendig_id) as berater_drin,
--            exists (select 1 from chat_teilnehmer t
--                     where t.chat_id = g.id
--                       and t.benutzer_id::text = k.meta->>'authUserId') as kunde_drin
--       from chat_gruppen g
--       join kontakte k on k.id::text = g.meta->>'kundeId'
--      where g.typ = 'kundenkommunikation'
--      order by teilnehmer;
--
-- Erwartet: ueberall zwei Teilnehmer, beide Spalten auf true. Steht bei
-- `kunde_drin` ein false, hat der Kunde noch keinen Portalzugang. Das ist
-- kein Fehler, er kann den Chat dann ohnehin nicht nutzen.
