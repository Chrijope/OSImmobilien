
-- Allow Kunde role to read their own kontakt record (linked via meta->>'authUserId')
CREATE POLICY "Kunden sehen eigenen Kontakt"
ON public.kontakte FOR SELECT
TO authenticated
USING (
  (meta->>'authUserId')::text = auth.uid()::text
);

-- Allow Kunde role to read their own investments (linked via kunde_id = kontakt.id where kontakt is linked to auth user)
CREATE POLICY "Kunden sehen eigene Investments"
ON public.investments FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.kontakte k
    WHERE k.id::text = investments.kunde_id
      AND (k.meta->>'authUserId')::text = auth.uid()::text
  )
);
