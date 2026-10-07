-- ===========================================================================
-- Chatanhaenge nur fuer Teilnehmer und Admins
-- ===========================================================================
--
-- WAS OFFEN STAND
--
-- Chatanhaenge liegen unter `chat/<Chatkennung>/` im Ablageort `unterlagen`.
-- Dort galten bisher ZWEI Leseregeln nebeneinander, und bei Zugriffsregeln
-- gilt ein Oder: Solange eine erlaubt, hilft keine engere daneben.
--
--   1. "Chat participants read unterlagen": nur Teilnehmer des Chats.
--      Richtig, bleibt unveraendert.
--   2. "Internal read unterlagen": JEDER mit einer internen Rolle darf den
--      gesamten Ablageort lesen, unabhaengig von jeder Teilnahme.
--
-- Die zweite hat die erste ausgehebelt. Ein Vertriebspartner kam damit an die
-- Anhaenge fremder Kundenchats, auch an Chats, in denen er nie war, und auch
-- nach einem Austritt. Die Regel stammt vom 22.03.2026 und war nie als
-- Chatregel gedacht; sie ist einfach breiter als noetig.
--
-- WAS SICH AENDERT
--
-- Nur diese eine Regel, und nur fuer den Ordner `chat`:
--
--   Ausserhalb von `chat/`  bleibt alles wie bisher.
--   Innerhalb von `chat/`   lesen nur noch Admin und Inhaber.
--
-- Die Teilnehmer selbst kommen weiterhin ueber Regel 1 hinein. An ihr wird
-- nichts angefasst.
--
-- Christians Vorgabe vom 19.09.2026: "Die Chat-Anhaenge sollen nur die lesen
-- koennen, die eben auch diesem Chat als Teilnehmer hinzugefuegt sind. Oder
-- eben Admin, der kann in alle Chats und Chatverlaeufe reinschauen."
--
-- WAS BEWUSST OFFEN BLEIBT
--
-- Aendern und Loeschen. `Internal update unterlagen`, `Unterlagen delete
-- intern` und `unterlagen_internal_delete` erlauben internen Rollen
-- weiterhin, Dateien im gesamten Ablageort zu ueberschreiben oder zu
-- entfernen, auch im Chatordner. Das ist ein eigener Punkt; hier geht es um
-- das Lesen, und eine Regel nach der anderen zu aendern ist bei
-- Zugriffsrechten der sicherere Weg.
--
-- WARUM COALESCE
--
-- Liegt eine Datei ohne Ordner im Ablageort, ist `foldername[1]` NULL. Ein
-- Vergleich mit NULL ergibt weder wahr noch falsch, sondern NULL, und die
-- Regel haette den Zugriff still verweigert. Das waere eine Verschaerfung an
-- einer Stelle gewesen, die niemand gemeint hat.
--
-- Wiederholbar: ein zweiter Lauf aendert nichts.
-- ===========================================================================

DROP POLICY IF EXISTS "Internal read unterlagen" ON storage.objects;

CREATE POLICY "Internal read unterlagen"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'unterlagen'
  AND public.is_internal_role(auth.uid())
  AND (
    COALESCE((storage.foldername(name))[1], '') <> 'chat'
    OR public.is_admin_role(auth.uid())
  )
);


-- ---------------------------------------------------------------------------
-- Nachsehen
-- ---------------------------------------------------------------------------
--
-- Steht die neue Fassung?
--
--     select policyname, qual
--       from pg_policies
--      where schemaname = 'storage' and tablename = 'objects'
--        and policyname in ('Internal read unterlagen',
--                           'Chat participants read unterlagen');
--
-- Erwartet: zwei Zeilen. In der ersten steht jetzt der Ordnervergleich.
--
-- Gegenprobe im Betrieb: Ein Vertriebspartner, der NICHT Teilnehmer eines
-- Chats ist, darf dessen Anhaenge nicht mehr oeffnen. Ein Teilnehmer und
-- jeder Admin schon. Am einfachsten zu pruefen, indem jemand aus dem Team
-- einen Anhang in einem fremden Chat aufzurufen versucht.
