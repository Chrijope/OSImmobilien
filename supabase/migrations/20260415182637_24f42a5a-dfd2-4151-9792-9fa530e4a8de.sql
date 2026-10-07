DROP POLICY IF EXISTS "Kunden sehen eigene Finanzierungen" ON public.finanzierungen;

CREATE POLICY "Kunden sehen eigene Finanzierungen"
ON public.finanzierungen
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.investments i
    JOIN public.kontakte k
      ON k.id::text = i.kunde_id
    WHERE i.id::text = finanzierungen.kunde_id
      AND (k.meta ->> 'authUserId') = auth.uid()::text
  )
);