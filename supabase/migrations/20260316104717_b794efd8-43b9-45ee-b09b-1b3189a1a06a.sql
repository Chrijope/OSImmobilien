
-- Helper function: check if user is a participant of a chat
CREATE OR REPLACE FUNCTION public.is_chat_participant(_user_id uuid, _chat_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chat_teilnehmer
    WHERE benutzer_id = _user_id AND chat_id = _chat_id
  )
$$;

-- Fix chat_gruppen: only participants or creators can see chats
DROP POLICY IF EXISTS "Nutzer sehen Chats" ON public.chat_gruppen;
CREATE POLICY "Nutzer sehen eigene Chats" ON public.chat_gruppen
  FOR SELECT TO authenticated
  USING (
    auth.uid() = erstellt_von
    OR is_chat_participant(auth.uid(), id)
    OR is_admin_role(auth.uid())
  );

-- Fix chat_nachrichten: only participants can see messages
DROP POLICY IF EXISTS "Nutzer sehen Nachrichten" ON public.chat_nachrichten;
CREATE POLICY "Nutzer sehen Chat-Nachrichten" ON public.chat_nachrichten
  FOR SELECT TO authenticated
  USING (
    is_chat_participant(auth.uid(), chat_id)
    OR is_admin_role(auth.uid())
  );

-- Fix chat_teilnehmer: only participants can see other participants
DROP POLICY IF EXISTS "Nutzer sehen Teilnehmer" ON public.chat_teilnehmer;
CREATE POLICY "Nutzer sehen Chat-Teilnehmer" ON public.chat_teilnehmer
  FOR SELECT TO authenticated
  USING (
    is_chat_participant(auth.uid(), chat_id)
    OR is_admin_role(auth.uid())
  );

-- Fix benachrichtigungen: users can only create notifications for themselves (or internal roles for others)
DROP POLICY IF EXISTS "Auth erstellt Benachrichtigungen" ON public.benachrichtigungen;
CREATE POLICY "Nutzer erstellen eigene Benachrichtigungen" ON public.benachrichtigungen
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = benutzer_id
    OR is_internal_role(auth.uid())
  );

-- Fix anrufe: restrict SELECT to own records or internal roles
DROP POLICY IF EXISTS "Nutzer sehen alle Anrufe" ON public.anrufe;
CREATE POLICY "Nutzer sehen eigene Anrufe" ON public.anrufe
  FOR SELECT TO authenticated
  USING (
    auth.uid() = benutzer_id
    OR is_internal_role(auth.uid())
  );
