DROP POLICY IF EXISTS "Alle lesen config" ON public.app_config;

CREATE POLICY "Interne Rollen lesen config"
ON public.app_config
FOR SELECT
TO authenticated
USING (public.is_internal_role(auth.uid()));