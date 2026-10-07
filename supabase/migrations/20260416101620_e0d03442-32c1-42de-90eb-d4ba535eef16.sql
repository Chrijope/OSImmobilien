
-- 1. Add person_nr to sa_fill_tokens (default 1 for existing rows)
ALTER TABLE public.sa_fill_tokens ADD COLUMN IF NOT EXISTS person_nr integer NOT NULL DEFAULT 1;

-- 2. Update kontakte RLS: Person 2 can also see the kontakt
DROP POLICY IF EXISTS "Kunden sehen eigenen Kontakt" ON public.kontakte;
CREATE POLICY "Kunden sehen eigenen Kontakt"
ON public.kontakte FOR SELECT TO authenticated
USING (
  (meta ->> 'authUserId') = auth.uid()::text
  OR (meta -> 'person2' ->> 'authUserId') = auth.uid()::text
);

-- 3. Update investments RLS: Person 2 can also see investments
DROP POLICY IF EXISTS "Kunden sehen eigene Investments" ON public.investments;
CREATE POLICY "Kunden sehen eigene Investments"
ON public.investments FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM kontakte k
    WHERE k.id::text = investments.kunde_id
    AND (
      (k.meta ->> 'authUserId') = auth.uid()::text
      OR (k.meta -> 'person2' ->> 'authUserId') = auth.uid()::text
    )
  )
);

-- 4. Update finanzierungen RLS: Person 2 can also see financing
DROP POLICY IF EXISTS "Kunden sehen eigene Finanzierungen" ON public.finanzierungen;
CREATE POLICY "Kunden sehen eigene Finanzierungen"
ON public.finanzierungen FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM investments i
    JOIN kontakte k ON k.id::text = i.kunde_id
    WHERE i.id::text = finanzierungen.kunde_id
    AND (
      (k.meta ->> 'authUserId') = auth.uid()::text
      OR (k.meta -> 'person2' ->> 'authUserId') = auth.uid()::text
    )
  )
);
