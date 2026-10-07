-- Tippgeber-Chats vom Austritt ausnehmen
--
-- Die Regel aus 20260802200000 erlaubt es, die eigene Teilnahme zu beenden,
-- und nimmt dabei nur Kundenchats aus. Tippgeber-Chats gehören ebenfalls
-- ausgenommen, und zwar aus einem handfesten Grund.
--
-- get_or_create_tippgeber_vp_chat sucht einen Chat, in dem **beide** sitzen,
-- der Tippgeber und sein zugeordneter Vertriebspartner. Fehlt einer von
-- beiden, findet die Funktion nichts und legt einen **neuen** Chat an. Tritt
-- der Vertriebspartner also aus, entstehen beim nächsten Öffnen des Portals
-- zwei gleichnamige Chats: der alte mit dem gesamten Verlauf und ein leerer
-- neuer. Für den Tippgeber sieht das aus, als wäre die Unterhaltung weg.
--
-- Fachlich gehört die Teilnahme ohnehin nicht dem Einzelnen: Wer im Chat
-- sitzt, ergibt sich aus tippgeber.zugeordnet_id. Soll jemand anders zuständig
-- sein, ändert man die Zuordnung, nicht die Teilnahme.
--
-- Übrig bleibt der Austritt aus normalen internen Chats. Dort ist er
-- umkehrbar, weil die andere Seite wieder einladen kann.

DROP POLICY IF EXISTS "Teilnehmer beenden eigene Teilnahme" ON public.chat_teilnehmer;

CREATE POLICY "Teilnehmer beenden eigene Teilnahme"
ON public.chat_teilnehmer
FOR DELETE
TO authenticated
USING (
  benutzer_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.chat_gruppen g
    WHERE g.id = chat_teilnehmer.chat_id
      AND COALESCE(g.typ, '') <> 'kundenkommunikation'
      AND COALESCE(g.meta->>'typ', '') <> 'kundenkommunikation'
      AND COALESCE(g.meta->>'kind', '') <> 'tippgeber_vp'
  )
);
