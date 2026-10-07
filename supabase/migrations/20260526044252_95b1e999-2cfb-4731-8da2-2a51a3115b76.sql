UPDATE public.kontakte
SET meta = COALESCE(meta, '{}'::jsonb) || jsonb_build_object('pipelineStufe', 'zugewiesen'),
    aktualisiert_am = now()
WHERE zustaendig_id IS NOT NULL
  AND COALESCE(meta->>'pipelineStufe', 'neuer_lead') IN ('neuer_lead', '')
  AND NOT COALESCE((meta->>'archiviert')::boolean, false);