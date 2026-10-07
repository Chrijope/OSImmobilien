CREATE POLICY "Kunden sehen eigene Finanzierungen"
ON public.finanzierungen
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.kontakte k
    WHERE k.id::text = finanzierungen.kunde_id
      AND (k.meta ->> 'authUserId') = auth.uid()::text
  )
);