DROP POLICY IF EXISTS "Allow authenticated users to read team call settings" ON public.team_call_settings;
DROP POLICY IF EXISTS "Authenticated users can read team call settings" ON public.team_call_settings;
DROP POLICY IF EXISTS "team_call_settings_select" ON public.team_call_settings;

CREATE POLICY "Internal roles can read team call settings"
ON public.team_call_settings
FOR SELECT
TO authenticated
USING (public.is_internal_role(auth.uid()));