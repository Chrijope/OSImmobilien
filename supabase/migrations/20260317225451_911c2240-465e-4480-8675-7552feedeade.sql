CREATE POLICY "Admins sehen alle Sessions"
ON public.login_sessions
FOR SELECT
TO authenticated
USING (is_admin_role(auth.uid()));