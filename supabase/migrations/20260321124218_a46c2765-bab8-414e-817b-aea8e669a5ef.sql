
-- Tabelle für Objekt-Einreichungen (Akquise)
CREATE TABLE public.objekt_einreichungen (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  benutzer_id UUID NOT NULL,
  
  -- Eigentümer-Daten
  eigentuemer_name TEXT,
  eigentuemer_geburtsdatum TEXT,
  eigentuemer_email TEXT,
  eigentuemer_telefon TEXT,
  eigentuemer_familienstand TEXT,
  eigentuemer_iban TEXT,
  eigentuemer_hrb TEXT,
  
  -- Objektdaten
  titel TEXT NOT NULL DEFAULT '',
  strasse TEXT,
  hausnummer TEXT,
  plz TEXT,
  ort TEXT,
  einheiten INTEGER,
  baujahr INTEGER,
  wohnflaeche_gesamt NUMERIC,
  
  -- Zustand Immobilie
  zustand_aussenfassade TEXT,
  zustand_dach TEXT,
  zustand_heizung TEXT,
  zustand_elektrik TEXT,
  zustand_fenster TEXT,
  zustand_waende TEXT,
  zustand_boden TEXT,
  zustand_haustuer TEXT,
  zustand_wohnungstueren TEXT,
  zustand_baeder TEXT,
  zustand_treppenhaus TEXT,
  
  -- Sanierung & Sonstiges
  sanierungsangebot TEXT,
  sonstige_infos TEXT,
  whg_massnahmen TEXT,
  musterwohnung TEXT,
  
  -- Wohnungen (JSON array)
  wohnungen JSONB DEFAULT '[]'::jsonb,
  
  -- Visualisierung & Verwaltung
  visualisierung TEXT,
  hausverwaltung TEXT,
  
  -- Abgeschlossenheitsbescheinigung & Teilungserklärung
  ab_eingereicht_am TEXT,
  bauamt TEXT,
  bauamt_ansprechpartner TEXT,
  notartermin_tk TEXT,
  zusaetzliche_infos_tk TEXT,
  
  -- Preis & Bewertung
  kaufpreis NUMERIC,
  
  -- Bilder (URLs)
  bilder JSONB DEFAULT '[]'::jsonb,
  
  -- Status & Meta
  status TEXT NOT NULL DEFAULT 'eingereicht',
  notizen TEXT,
  bewertung TEXT,
  uebernommen_am TIMESTAMP WITH TIME ZONE,
  uebernommenes_objekt_id UUID,
  
  erstellt_am TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  aktualisiert_am TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- RLS aktivieren
ALTER TABLE public.objekt_einreichungen ENABLE ROW LEVEL SECURITY;

-- Interne Nutzer können alles sehen
CREATE POLICY "Interne sehen Einreichungen" ON public.objekt_einreichungen
  FOR SELECT TO authenticated
  USING (is_internal_role(auth.uid()));

-- Interne Nutzer können erstellen
CREATE POLICY "Interne erstellen Einreichungen" ON public.objekt_einreichungen
  FOR INSERT TO authenticated
  WITH CHECK (is_internal_role(auth.uid()));

-- Interne Nutzer können bearbeiten
CREATE POLICY "Interne bearbeiten Einreichungen" ON public.objekt_einreichungen
  FOR UPDATE TO authenticated
  USING (is_internal_role(auth.uid()));

-- Admins können löschen
CREATE POLICY "Admins loeschen Einreichungen" ON public.objekt_einreichungen
  FOR DELETE TO authenticated
  USING (is_admin_role(auth.uid()));
