DROP POLICY IF EXISTS "Objekt-Manager erstellen Bilder" ON public.objekt_bilder;
DROP POLICY IF EXISTS "Objekt-Manager bearbeiten Bilder" ON public.objekt_bilder;
DROP POLICY IF EXISTS "Objekt-Manager loeschen Bilder" ON public.objekt_bilder;

CREATE POLICY "Interne erstellen Bilder"
ON public.objekt_bilder
FOR INSERT
TO authenticated
WITH CHECK (public.is_internal_role(auth.uid()));

CREATE POLICY "Interne bearbeiten Bilder"
ON public.objekt_bilder
FOR UPDATE
TO authenticated
USING (public.is_internal_role(auth.uid()))
WITH CHECK (public.is_internal_role(auth.uid()));

CREATE POLICY "Interne loeschen Bilder"
ON public.objekt_bilder
FOR DELETE
TO authenticated
USING (public.is_internal_role(auth.uid()));