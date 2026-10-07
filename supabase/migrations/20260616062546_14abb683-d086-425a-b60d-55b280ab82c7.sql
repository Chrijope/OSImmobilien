
UPDATE public.kontakte
SET meta = COALESCE(meta, '{}'::jsonb) || jsonb_build_object(
  'kontaktTyp',
  CASE
    WHEN COALESCE(meta->>'quelle','') ILIKE '%zapier%'
      OR COALESCE(meta->>'quelle','') ILIKE '%analysetool%'
      OR COALESCE(meta->>'quelle','') ILIKE '%webhook%'
      OR COALESCE(meta->>'quelle','') ILIKE '%api%'
      OR COALESCE(meta->>'quelle','') ILIKE '%webformular%'
      THEN 'lead'
    ELSE 'eigen'
  END
)
WHERE meta->>'kontaktTyp' IS NULL;
