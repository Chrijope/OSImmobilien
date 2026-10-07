CREATE POLICY "Admins loeschen Investments"
ON public.investments
FOR DELETE
TO authenticated
USING (is_admin_role(auth.uid()));