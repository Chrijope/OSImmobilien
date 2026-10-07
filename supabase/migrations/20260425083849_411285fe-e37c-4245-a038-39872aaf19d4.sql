-- Index für Setter-Attribution (kontakte.meta->>'setter_id')
CREATE INDEX IF NOT EXISTS idx_kontakte_meta_setter_id 
  ON public.kontakte ((meta->>'setter_id'));

-- Index für Aktivitäten-Datum (für Show-Rate-Auswertungen pro Zeitraum)
CREATE INDEX IF NOT EXISTS idx_aktivitaeten_datum 
  ON public.aktivitaeten (datum);

-- Index für Investments nach Kaufdatum (für Umsatz-Auswertungen pro Zeitraum)
CREATE INDEX IF NOT EXISTS idx_investments_kaufdatum 
  ON public.investments (kaufdatum);

-- Index für Investments nach kunde_id (Lookup für ROI/VP-Zuordnung)
CREATE INDEX IF NOT EXISTS idx_investments_kunde_id 
  ON public.investments (kunde_id);