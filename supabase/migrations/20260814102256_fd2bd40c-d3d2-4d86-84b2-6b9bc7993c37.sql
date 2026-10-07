-- Sperre für matthiasfink1@yahoo.de aufheben (einmaliger Bounce von Yahoo)
DELETE FROM public.suppressed_emails WHERE email = 'matthiasfink1@yahoo.de';

-- Admins und Inhaber duerfen Adressen von der Sperrliste nehmen
DROP POLICY IF EXISTS "Admins duerfen Sperrliste bereinigen" ON public.suppressed_emails;
CREATE POLICY "Admins duerfen Sperrliste bereinigen"
ON public.suppressed_emails
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'inhaber'));

GRANT DELETE ON public.suppressed_emails TO authenticated;