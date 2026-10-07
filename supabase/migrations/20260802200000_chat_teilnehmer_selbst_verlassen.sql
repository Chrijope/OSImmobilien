-- Eigene Teilnahme an einem Chat beenden dürfen
--
-- Bisher gab es auf chat_teilnehmer genau eine DELETE-Regel, und die galt nur
-- für Admins ("Admins entfernen Teilnehmer", Migration 20260321141014). Ein
-- Vertriebspartner konnte seine eigene Teilnahme also gar nicht löschen.
--
-- Die Oberfläche hat das nie bemerkt, weil "Chat verlassen" den Teilnehmer nur
-- im Arbeitsspeicher entfernt und danach neu geladen hat. Sichtbar passierte
-- nichts, nur die Systemmeldung "hat den Chat verlassen" blieb stehen. Wer ein
-- zweites Mal klickte, bekam sie ein zweites Mal. Genau das ist im Chat
-- "Tippgeber: Noah Kelava" passiert.
--
-- Diese Regel erlaubt ausschließlich das Löschen der eigenen Zeile, und nur in
-- internen Chats. Kundenchats sind eins zu eins: verlässt eine der beiden
-- Seiten den Chat, bleibt ein Gespräch ohne Gegenüber zurück. Dort bleibt der
-- Austritt deshalb gesperrt.

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
  )
);
