CREATE OR REPLACE FUNCTION public.ist_empfehlungsgeber_von(_user_id uuid, _empfehlungsgeber_kontakt_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.kontakte k
    WHERE k.id::text = _empfehlungsgeber_kontakt_id
      AND (k.meta ->> 'authUserId') = _user_id::text
  )
$$;

DROP POLICY IF EXISTS "Kunden erstellen Empfehlungs-Leads" ON public.kontakte;

CREATE POLICY "Kunden erstellen Empfehlungs-Leads"
ON public.kontakte
FOR INSERT
TO authenticated
WITH CHECK (
  COALESCE((meta ->> 'empfehlungsgeber')::boolean, false) = true
  AND public.ist_empfehlungsgeber_von(auth.uid(), meta ->> 'empfehlungsgeberKontaktId')
);