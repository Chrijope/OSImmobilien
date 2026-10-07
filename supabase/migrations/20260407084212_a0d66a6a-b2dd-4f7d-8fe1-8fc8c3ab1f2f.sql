DROP POLICY "Admins loeschen Kontakte" ON public.kontakte;

CREATE POLICY "Interne loeschen Kontakte"
ON public.kontakte
FOR DELETE
TO authenticated
USING (is_internal_role(auth.uid()));