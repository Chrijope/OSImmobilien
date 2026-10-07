-- Backfill: Investments und Kontakte, die fälschlich als "erstgespraech" markiert sind,
-- obwohl der Lead noch nie erreicht wurde (nichtErreichtCount > 0 UND kein
-- setterTerminDatum/beratungsgespraechAm) → zurück auf "neuer_lead" bzw. "nicht_erreicht".
WITH bad_kontakte AS (
  SELECT k.id
  FROM kontakte k
  WHERE (k.meta->>'nichtErreichtCount')::int > 0
    AND COALESCE(k.meta->>'setterTerminDatum','') = ''
    AND COALESCE(k.meta->>'beratungsgespraechAm','') = ''
    AND COALESCE(k.meta->>'erstgespraechAm','') = ''
    AND (k.meta->>'pipelineStufe') = 'erstgespraech'
),
inv_reset AS (
  UPDATE investments i
  SET meta = jsonb_set(COALESCE(i.meta,'{}'::jsonb),'{pipelineStufe}', to_jsonb('neuer_lead'::text))
  WHERE i.kunde_id IN (SELECT id FROM bad_kontakte)
    AND (i.meta->>'pipelineStufe') = 'erstgespraech'
  RETURNING i.id
)
UPDATE kontakte k
SET meta = jsonb_set(
  COALESCE(k.meta,'{}'::jsonb),
  '{pipelineStufe}',
  to_jsonb(CASE WHEN (k.meta->>'nichtErreichtCount')::int > 0 THEN 'nicht_erreicht' ELSE 'neuer_lead' END)
)
WHERE k.id IN (SELECT id FROM bad_kontakte);