-- Korrigiere fehlerhaft als "3.000"/"1.000" gespeicherte Einkommenswerte bei Patrick Gebele
-- in numerische Strings ohne Tausenderpunkt, damit parser konsistent 3000/1000 liest.

UPDATE investments
SET meta = jsonb_set(
  jsonb_set(
    meta,
    '{saData,einkommen,netto}',
    '"3000"'::jsonb
  ),
  '{saData,einkommen,miet}',
  '"1000"'::jsonb
)
WHERE id = '86028d9a-3034-47b7-a747-4584f8749d57'
  AND meta #>> '{saData,einkommen,netto}' = '3.000';

UPDATE signature_requests
SET sa_data = jsonb_set(
  jsonb_set(
    sa_data,
    '{einkommen,netto}',
    '"3000"'::jsonb
  ),
  '{einkommen,miet}',
  '"1000"'::jsonb
)
WHERE id = '805dc319-1235-4403-b810-6e4e1f5b749e'
  AND sa_data #>> '{einkommen,netto}' = '3.000';