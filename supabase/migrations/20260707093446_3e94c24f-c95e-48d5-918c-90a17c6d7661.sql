
CREATE POLICY "Admins sehen alle Benachrichtigungen"
  ON public.benachrichtigungen FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'inhaber'));
