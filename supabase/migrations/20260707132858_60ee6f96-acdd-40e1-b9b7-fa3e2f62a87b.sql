
-- Helper: updated_at Trigger-Funktion (falls nicht vorhanden)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- 1. QUELLEN
CREATE TABLE public.marktanalyse_quellen (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT,
  kategorie TEXT,
  lizenz TEXT,
  stand DATE,
  beschreibung TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.marktanalyse_quellen TO authenticated;
GRANT ALL ON public.marktanalyse_quellen TO service_role;
ALTER TABLE public.marktanalyse_quellen ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Quellen sichtbar" ON public.marktanalyse_quellen
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins verwalten Quellen" ON public.marktanalyse_quellen
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'inhaber'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'inhaber'));

-- 2. STANDORTE
CREATE TABLE public.standorte (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ags TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  bundesland TEXT NOT NULL,
  kreis TEXT,
  typ TEXT NOT NULL DEFAULT 'kreisstadt',
  lat NUMERIC(9,6),
  lng NUMERIC(9,6),
  einwohner INTEGER,
  einwohner_stand DATE,
  uni_stadt BOOLEAN NOT NULL DEFAULT false,
  oepnv_score SMALLINT,
  highlights JSONB NOT NULL DEFAULT '[]'::jsonb,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_standorte_bundesland ON public.standorte(bundesland);
CREATE INDEX idx_standorte_name ON public.standorte(name);
GRANT SELECT ON public.standorte TO authenticated;
GRANT ALL ON public.standorte TO service_role;
ALTER TABLE public.standorte ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Standorte sichtbar" ON public.standorte
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins verwalten Standorte" ON public.standorte
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'inhaber'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'inhaber'));

-- 3. KENNZAHLEN
CREATE TABLE public.standort_kennzahlen (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  standort_id UUID NOT NULL REFERENCES public.standorte(id) ON DELETE CASCADE,
  kennzahl TEXT NOT NULL,
  wert NUMERIC,
  einheit TEXT,
  stand DATE,
  quelle_id TEXT REFERENCES public.marktanalyse_quellen(id),
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(standort_id, kennzahl, stand)
);
CREATE INDEX idx_kennz_standort ON public.standort_kennzahlen(standort_id);
CREATE INDEX idx_kennz_key ON public.standort_kennzahlen(kennzahl);
GRANT SELECT ON public.standort_kennzahlen TO authenticated;
GRANT ALL ON public.standort_kennzahlen TO service_role;
ALTER TABLE public.standort_kennzahlen ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Kennzahlen sichtbar" ON public.standort_kennzahlen
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins verwalten Kennzahlen" ON public.standort_kennzahlen
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'inhaber'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'inhaber'));

-- 4. ARBEITGEBER
CREATE TABLE public.standort_arbeitgeber (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  standort_id UUID NOT NULL REFERENCES public.standorte(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  branche TEXT,
  mitarbeiter INTEGER,
  quelle_id TEXT REFERENCES public.marktanalyse_quellen(id),
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_arbeitgeber_standort ON public.standort_arbeitgeber(standort_id);
GRANT SELECT ON public.standort_arbeitgeber TO authenticated;
GRANT ALL ON public.standort_arbeitgeber TO service_role;
ALTER TABLE public.standort_arbeitgeber ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Arbeitgeber sichtbar" ON public.standort_arbeitgeber
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins verwalten Arbeitgeber" ON public.standort_arbeitgeber
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'inhaber'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'inhaber'));

-- Trigger
CREATE TRIGGER trg_upd_marktanalyse_quellen BEFORE UPDATE ON public.marktanalyse_quellen
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_upd_standorte BEFORE UPDATE ON public.standorte
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_upd_kennz BEFORE UPDATE ON public.standort_kennzahlen
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_upd_arbeitgeber BEFORE UPDATE ON public.standort_arbeitgeber
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed Quellen
INSERT INTO public.marktanalyse_quellen (id, name, url, kategorie, lizenz, stand, beschreibung) VALUES
 ('destatis','Statistisches Bundesamt (Destatis)','https://www-genesis.destatis.de/','Demografie/Wirtschaft','dl-de/by-2-0',CURRENT_DATE,'Einwohner, Bevölkerungstrend, BIP, Kaufkraft-Median'),
 ('boris','BORIS-D Bodenrichtwerte','https://www.bodenrichtwerte-boris.de/','Immobilien','länderspezifisch',CURRENT_DATE,'Bodenrichtwerte je Bundesland'),
 ('bbsr','BBSR Wohnungsmarktbeobachtung','https://www.bbsr.bund.de/','Immobilien','dl-de/by-2-0',CURRENT_DATE,'Kaufpreise, Mieten, Leerstand'),
 ('ba','Bundesagentur für Arbeit','https://statistik.arbeitsagentur.de/','Arbeitsmarkt','dl-de/by-2-0',CURRENT_DATE,'Arbeitslosenquote Kreise'),
 ('osm','OpenStreetMap / Overpass','https://overpass-api.de/','Mikrolage','ODbL',CURRENT_DATE,'POIs Kitas, Schulen, ÖPNV, Ärzte, Einkauf'),
 ('bmdv','Bundesministerium für Digitales und Verkehr','https://bmdv.bund.de/','Infrastruktur','dl-de/by-2-0',CURRENT_DATE,'Verkehrsanbindung, Breitband'),
 ('ihk','Unternehmensregister / IHK','https://www.unternehmensregister.de/','Wirtschaft','öffentlich',CURRENT_DATE,'Top-Arbeitgeber, Unternehmensdaten'),
 ('lovable-ai','Lovable AI (Gemini)','https://lovable.dev/','Aggregation','projekt-intern',CURRENT_DATE,'KI-Anreicherung fehlender Werte, immer mit Primärquelle zitiert');
