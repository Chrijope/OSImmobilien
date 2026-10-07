-- One-shot Backfill: Kontakt-pipelineStufe an höchste Investment-Stufe angleichen.
-- Verhindert, dass Pipeline-Übersicht und Kundenprofil-Header divergieren,
-- wenn in der Vergangenheit nur das Investment (nicht der Kontakt) fortgeschritten wurde.
WITH stage_order(stufe, ord) AS (
  VALUES
    ('archiviert', -2), ('verloren', -1),
    ('neuer_lead', 0), ('nicht_erreicht', 1), ('erreicht', 2),
    ('follow_up', 3), ('zugewiesen', 4),
    ('erstgespraech_geplant', 5), ('erstgespraech', 6), ('eg_noshow', 7),
    ('beratungsgespraech', 8), ('bg_noshow', 9),
    ('selbstauskunft', 10), ('bonitaetsunterlagen', 11), ('objektauswahl', 12),
    ('reservierung', 13), ('finanzierung', 14), ('notar', 15),
    ('faelligkeit', 16), ('abrechnung', 17), ('abgeschlossen', 18)
),
inv_max AS (
  SELECT i.kunde_id, MAX(so.ord) AS max_ord
  FROM investments i
  JOIN stage_order so ON so.stufe = i.meta->>'pipelineStufe'
  WHERE i.meta ? 'pipelineStufe'
  GROUP BY i.kunde_id
),
picked AS (
  SELECT im.kunde_id, so.stufe AS inv_stufe
  FROM inv_max im
  JOIN stage_order so ON so.ord = im.max_ord
)
UPDATE kontakte k
SET meta = jsonb_set(COALESCE(k.meta, '{}'::jsonb), '{pipelineStufe}', to_jsonb(p.inv_stufe))
FROM picked p,
     stage_order sk
WHERE k.id = p.kunde_id
  AND sk.stufe = COALESCE(k.meta->>'pipelineStufe', 'neuer_lead')
  AND (SELECT ord FROM stage_order WHERE stufe = p.inv_stufe) > sk.ord;