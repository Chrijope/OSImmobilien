-- Allow participants to update gelesen_von on messages they can see
CREATE POLICY "Teilnehmer aktualisieren Lesebestätigung"
ON public.chat_nachrichten
FOR UPDATE
TO authenticated
USING (is_chat_participant(auth.uid(), chat_id) OR is_admin_role(auth.uid()))
WITH CHECK (is_chat_participant(auth.uid(), chat_id) OR is_admin_role(auth.uid()));

-- Allow admins to delete chats
-- (already exists for creator, add admin policy)
CREATE POLICY "Admins loeschen Chats"
ON public.chat_gruppen
FOR DELETE
TO authenticated
USING (is_admin_role(auth.uid()));

-- Allow admins to update any chat
CREATE POLICY "Admins bearbeiten Chats"
ON public.chat_gruppen
FOR UPDATE
TO authenticated
USING (is_admin_role(auth.uid()));

-- Allow admins/participants to delete chat_teilnehmer (for remove participant)
CREATE POLICY "Admins entfernen Teilnehmer"
ON public.chat_teilnehmer
FOR DELETE
TO authenticated
USING (is_admin_role(auth.uid()));