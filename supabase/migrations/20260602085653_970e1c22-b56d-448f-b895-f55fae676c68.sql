-- Reset Musti Musterimann's stuck investment back to "Einheitenauswahl" and clear residual reservation data so the VP card and customer portal show the unit selection again.
UPDATE public.investments
SET meta = (
  COALESCE(meta, '{}'::jsonb)
  - 'objektId' - 'objektTitel' - 'wohnungId' - 'weNr'
  - 'rvPdf' - 'rvData' - 'rvSignatures' - 'rvSigned' - 'rvSignedAt'
  - 'rvSignaturePending' - 'rvSignatureSentAt' - 'rvEditApproved' - 'reserviertAm'
) || jsonb_build_object(
  'pipelineStufe', 'objektauswahl',
  'einheitGewechseltAm', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  'einheitGewechseltVon', 'System (Datenkorrektur)'
)
WHERE id = '941b34b6-8527-42e7-b9b9-728d0e9073b5';

UPDATE public.kontakte
SET meta = COALESCE(meta, '{}'::jsonb) || jsonb_build_object(
  'pipelineStufe', 'objektauswahl',
  'objekt', '',
  'kaufpreis', 0
)
WHERE id = '6033bb16-135b-4ed9-a490-c3d399f422cb';