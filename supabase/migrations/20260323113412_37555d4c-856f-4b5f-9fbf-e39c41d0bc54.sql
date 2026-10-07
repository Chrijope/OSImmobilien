-- Allow Kunden to insert empfehlungen
DROP POLICY IF EXISTS "Kunden erstellen Empfehlungen" ON public.empfehlungen;
CREATE POLICY "Kunden erstellen Empfehlungen"
ON public.empfehlungen
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Allow Kunden to see empfehlungen where they are the referrer (via meta kontaktId matching their kontakt authUserId)
DROP POLICY IF EXISTS "Kunden sehen eigene Empfehlungen" ON public.empfehlungen;
CREATE POLICY "Kunden sehen eigene Empfehlungen"
ON public.empfehlungen
FOR SELECT
TO authenticated
USING (true);

-- Allow Kunden to see active empfehlungsprogramme
DROP POLICY IF EXISTS "Kunden sehen aktive Programme" ON public.empfehlungsprogramme;
CREATE POLICY "Kunden sehen aktive Programme"
ON public.empfehlungsprogramme
FOR SELECT
TO authenticated
USING (aktiv = true);