
-- Allow internal users to add participants to chats (not just themselves)
DROP POLICY IF EXISTS "Nutzer treten bei" ON public.chat_teilnehmer;
CREATE POLICY "Nutzer treten bei"
ON public.chat_teilnehmer
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = benutzer_id OR is_internal_role(auth.uid())
);
