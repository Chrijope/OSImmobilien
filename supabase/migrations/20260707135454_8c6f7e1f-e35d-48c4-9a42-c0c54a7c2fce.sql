ALTER TABLE public.standort_arbeitgeber
  ADD COLUMN IF NOT EXISTS hauptsitz BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rang SMALLINT,
  ADD COLUMN IF NOT EXISTS quelle TEXT;
CREATE INDEX IF NOT EXISTS idx_arbeitgeber_quelle ON public.standort_arbeitgeber(quelle);