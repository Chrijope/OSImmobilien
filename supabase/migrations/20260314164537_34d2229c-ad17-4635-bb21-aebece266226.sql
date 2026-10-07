
-- Allow all authenticated users to see all benachrichtigungen (for cross-role notifications like delete requests)
DROP POLICY IF EXISTS "Nutzer sehen eigene Benachrichtigungen" ON public.benachrichtigungen;
CREATE POLICY "Nutzer sehen alle Benachrichtigungen" ON public.benachrichtigungen FOR SELECT TO authenticated USING (true);

-- Allow all authenticated users to insert benachrichtigungen (system notifications)
DROP POLICY IF EXISTS "System erstellt Benachrichtigungen" ON public.benachrichtigungen;
CREATE POLICY "Auth erstellt Benachrichtigungen" ON public.benachrichtigungen FOR INSERT TO authenticated WITH CHECK (true);
