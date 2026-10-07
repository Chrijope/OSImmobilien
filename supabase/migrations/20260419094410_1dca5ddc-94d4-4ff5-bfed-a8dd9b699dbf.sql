
-- Tabelle für Kundenbewertungen nach Abschluss
CREATE TABLE public.kunden_bewertungen (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  kunde_id UUID NOT NULL,
  investment_id UUID,
  berater_id UUID,
  berater_name TEXT,
  bewertung_gesamt INTEGER NOT NULL CHECK (bewertung_gesamt BETWEEN 1 AND 5),
  bewertung_berater INTEGER CHECK (bewertung_berater BETWEEN 1 AND 5),
  bewertung_prozess INTEGER CHECK (bewertung_prozess BETWEEN 1 AND 5),
  bewertung_objekt INTEGER CHECK (bewertung_objekt BETWEEN 1 AND 5),
  kommentar TEXT,
  weiterempfehlung BOOLEAN DEFAULT false,
  erstellt_am TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.kunden_bewertungen ENABLE ROW LEVEL SECURITY;

-- Kunde sieht/erstellt eigene Bewertungen
CREATE POLICY "Kunden sehen eigene Bewertungen"
ON public.kunden_bewertungen FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.kontakte k
    WHERE k.id = kunden_bewertungen.kunde_id
      AND ((k.meta ->> 'authUserId') = auth.uid()::text
        OR ((k.meta -> 'person2') ->> 'authUserId') = auth.uid()::text)
  )
);

CREATE POLICY "Kunden erstellen eigene Bewertungen"
ON public.kunden_bewertungen FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.kontakte k
    WHERE k.id = kunden_bewertungen.kunde_id
      AND ((k.meta ->> 'authUserId') = auth.uid()::text
        OR ((k.meta -> 'person2') ->> 'authUserId') = auth.uid()::text)
  )
);

-- Interne sehen alle Bewertungen
CREATE POLICY "Interne sehen alle Bewertungen"
ON public.kunden_bewertungen FOR SELECT
TO authenticated
USING (public.is_internal_role(auth.uid()));

-- Admins/Inhaber dürfen löschen
CREATE POLICY "Admins loeschen Bewertungen"
ON public.kunden_bewertungen FOR DELETE
TO authenticated
USING (public.is_admin_role(auth.uid()));

CREATE INDEX idx_kunden_bewertungen_berater ON public.kunden_bewertungen(berater_id);
CREATE INDEX idx_kunden_bewertungen_kunde ON public.kunden_bewertungen(kunde_id);
