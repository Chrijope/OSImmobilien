ALTER TABLE public.objekte
  ADD COLUMN IF NOT EXISTS erhaltungsaufwand numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS erhaltungsaufwand_jahre integer DEFAULT 1;

-- Bestehende Sanierungskosten als Erhaltungsaufwand übernehmen (Default 1 Jahr)
UPDATE public.objekte
SET erhaltungsaufwand = COALESCE(sanierungskosten, 0)
WHERE (erhaltungsaufwand IS NULL OR erhaltungsaufwand = 0)
  AND COALESCE(sanierungskosten, 0) > 0;