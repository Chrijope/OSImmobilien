UPDATE public.aktivitaeten
SET von = 'Michael Obler-Mantel',
    benutzer_id = '9ac883e1-83c6-4bcb-9927-a13b68fadb68'
WHERE id IN (
  '6861bfe6-438e-4349-8844-b6cb5274638b',
  'dbd9118a-3f65-449c-b9d1-6ca601e752a7',
  '39b47688-4cd7-4894-8212-a35fef2f6812'
)
AND kunde_id = '62d4a01a-55c8-43c2-a5dd-97bb07f7b3a7';