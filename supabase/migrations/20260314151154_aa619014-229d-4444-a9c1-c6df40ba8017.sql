
CREATE TABLE public.tippgeber (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vorname text NOT NULL,
  nachname text NOT NULL,
  email text,
  telefon text,
  strasse text,
  hausnummer text,
  plz text,
  ort text,
  land text DEFAULT 'Deutschland',
  zugeordnet_id uuid,
  zugeordnet_name text,
  provisionstyp text DEFAULT 'euro',
  provisionswert text,
  notizen text,
  status text DEFAULT 'aktiv',
  benutzer_id uuid,
  erstellt_am timestamptz DEFAULT now(),
  meta jsonb DEFAULT '{}'::jsonb
);

ALTER TABLE public.tippgeber ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Alle sehen Tippgeber" ON public.tippgeber FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth erstellen Tippgeber" ON public.tippgeber FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth bearbeiten Tippgeber" ON public.tippgeber FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Auth loeschen Tippgeber" ON public.tippgeber FOR DELETE TO authenticated USING (true);
