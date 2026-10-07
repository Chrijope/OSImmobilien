CREATE POLICY "Kunden erstellen Empfehlungs-Leads"
ON public.kontakte
FOR INSERT
TO authenticated
WITH CHECK (
  COALESCE((meta->>'empfehlungsgeber')::boolean, false) = true
  AND EXISTS (
    SELECT 1 FROM public.kontakte k
    WHERE k.id::text = kontakte.meta->>'empfehlungsgeberKontaktId'
      AND k.meta->>'authUserId' = auth.uid()::text
  )
);