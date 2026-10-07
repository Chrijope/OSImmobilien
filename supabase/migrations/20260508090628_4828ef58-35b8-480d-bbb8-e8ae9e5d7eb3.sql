
-- Tabelle für vorhandene/externe Immobilien-Investments der Kunden
CREATE TABLE public.externe_investments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  bezeichnung text NOT NULL,
  adresse text,
  plz text,
  ort text,
  objekttyp text DEFAULT 'wohnung',
  baujahr integer,
  wohnflaeche numeric,
  kaufpreis numeric DEFAULT 0,
  kaufdatum text,
  nebenkosten numeric DEFAULT 0,
  darlehenssumme numeric DEFAULT 0,
  offene_tilgung numeric DEFAULT 0,
  zinssatz numeric DEFAULT 0,
  monatliche_rate numeric DEFAULT 0,
  mieteinnahmen_kalt numeric DEFAULT 0,
  mieteinnahmen_warm numeric DEFAULT 0,
  hausgeld numeric DEFAULT 0,
  ruecklagen numeric DEFAULT 0,
  verwalter text,
  notizen text,
  dokumente jsonb DEFAULT '[]'::jsonb,
  meta jsonb DEFAULT '{}'::jsonb,
  erstellt_am timestamp with time zone NOT NULL DEFAULT now(),
  aktualisiert_am timestamp with time zone NOT NULL DEFAULT now()
);

-- RLS aktivieren
ALTER TABLE public.externe_investments ENABLE ROW LEVEL SECURITY;

-- Kunden sehen nur eigene Einträge
CREATE POLICY "Kunden sehen eigene externe Investments"
  ON public.externe_investments
  FOR SELECT
  USING (auth.uid() = user_id OR is_admin_role(auth.uid()));

-- Kunden erstellen eigene Einträge
CREATE POLICY "Kunden erstellen externe Investments"
  ON public.externe_investments
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Kunden bearbeiten eigene Einträge
CREATE POLICY "Kunden bearbeiten eigene externe Investments"
  ON public.externe_investments
  FOR UPDATE
  USING (auth.uid() = user_id OR is_admin_role(auth.uid()));

-- Kunden löschen eigene Einträge
CREATE POLICY "Kunden loeschen eigene externe Investments"
  ON public.externe_investments
  FOR DELETE
  USING (auth.uid() = user_id OR is_admin_role(auth.uid()));

-- Timestamp-Trigger
CREATE TRIGGER update_externe_investments_ts
  BEFORE UPDATE ON public.externe_investments
  FOR EACH ROW
  EXECUTE FUNCTION public.aktualisiere_zeitstempel();
