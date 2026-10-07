-- Allow anonymous (public) inserts into objekt_einreichungen
CREATE POLICY "Oeffentliche Einreichungen erstellen"
ON public.objekt_einreichungen
FOR INSERT
TO anon
WITH CHECK (true);