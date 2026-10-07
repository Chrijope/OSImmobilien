-- Backfill: Für Altkunden mit ausgefülltem Erstgesprächs-Skript ohne Investment
-- wird Investment 1 angelegt, damit die neue Investment-zentrische Darstellung
-- (Skript + Beratungsgespräch-Buchung im Investment-Tab) einheitlich greift.
-- Pipeline-Stufe wird vom Kontakt übernommen (Fallback: 'erstgespraech').
INSERT INTO public.investments (id, kunde_id, status, erstellt_am, meta)
SELECT
  gen_random_uuid(),
  k.id,
  'aktiv',
  now(),
  jsonb_build_object(
    'nummer', 1,
    'label', 'Investment 1',
    'pipelineStufe', COALESCE(NULLIF(k.meta->>'pipelineStufe',''), 'erstgespraech'),
    'autoCreatedFrom', 'backfill_setterSkript_2026_06_22'
  )
FROM public.kontakte k
WHERE k.meta ? 'setterSkript'
  AND NOT EXISTS (SELECT 1 FROM public.investments i WHERE i.kunde_id = k.id);