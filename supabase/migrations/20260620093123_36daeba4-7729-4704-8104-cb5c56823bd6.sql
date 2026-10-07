UPDATE public.kontakte
SET meta = jsonb_set(COALESCE(meta, '{}'::jsonb), '{pipelineStufe}', '"zugewiesen"'::jsonb, true)
WHERE berater = 'Christian Peetz'
  AND COALESCE(meta->>'pipelineStufe', '') IN ('neuer_lead', 'kontaktversuche', '')
  AND nachname IN ('Ruffing', 'Zitzmann-Schreiner', 'Strobel');