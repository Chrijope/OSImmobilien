
-- Soft-Delete Erweiterung für kontakte
ALTER TABLE public.kontakte 
  ADD COLUMN IF NOT EXISTS geloescht_am TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS geloescht_von UUID,
  ADD COLUMN IF NOT EXISTS geloescht_von_name TEXT,
  ADD COLUMN IF NOT EXISTS geloescht_grund TEXT;

-- Index für schnelle Filterung der nicht-gelöschten Kontakte und Papierkorb-Liste
CREATE INDEX IF NOT EXISTS idx_kontakte_geloescht ON public.kontakte (geloescht) WHERE geloescht = true;
CREATE INDEX IF NOT EXISTS idx_kontakte_geloescht_am ON public.kontakte (geloescht_am) WHERE geloescht = true;
