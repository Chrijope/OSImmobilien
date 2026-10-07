-- Allow admins/inhaber to read ALL user_settings rows
CREATE POLICY "Admins can read all user_settings"
ON public.user_settings
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'inhaber')
);

-- Allow admins/inhaber to update ANY user_settings row
CREATE POLICY "Admins can update all user_settings"
ON public.user_settings
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'inhaber')
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'inhaber')
);