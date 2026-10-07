-- Sync pipeline stufe für David Botzem: Kontakt-Stufe an Investment-Stufe angleichen
UPDATE public.kontakte
SET meta = jsonb_set(COALESCE(meta, '{}'::jsonb), '{pipelineStufe}', '"beratungsgespraech"'::jsonb)
WHERE id = '7e396829-8f89-4983-ac28-9b17b721429b';