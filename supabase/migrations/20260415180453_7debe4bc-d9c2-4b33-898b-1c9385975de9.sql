CREATE POLICY "Interne loeschen Empfehlungen"
ON public.empfehlungen
FOR DELETE
TO authenticated
USING (is_internal_role(auth.uid()));