-- Erlaubt Chat-Teilnehmern, sich gegenseitig Benachrichtigungen zu schreiben
-- (z.B. Kunde -> Berater bei neuer Chat-Nachricht)
DROP POLICY IF EXISTS "Nutzer erstellen eigene Benachrichtigungen" ON public.benachrichtigungen;

CREATE POLICY "Nutzer erstellen eigene Benachrichtigungen"
ON public.benachrichtigungen
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = benutzer_id
  OR public.is_internal_role(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.chat_teilnehmer ct1
    JOIN public.chat_teilnehmer ct2 ON ct1.chat_id = ct2.chat_id
    WHERE ct1.benutzer_id = auth.uid()
      AND ct2.benutzer_id = benachrichtigungen.benutzer_id
  )
);