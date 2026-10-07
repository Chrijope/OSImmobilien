SELECT 
  f.id AS finanzierung_id,
  f.kunde_id AS investment_id,
  i.kunde_id AS kontakt_id,
  k.vorname,
  k.nachname,
  jsonb_path_query_array(COALESCE(f.angebote, '[]'::jsonb), '$[*].dokumente[*] ? (@.name == "Finanzierungsangebot" || @.name == "Grundschuld" || @.name == "Darlehensvertrag")') AS relevante_dokumente
FROM public.finanzierungen f
LEFT JOIN public.investments i ON i.id::text = f.kunde_id
LEFT JOIN public.kontakte k ON k.id::text = i.kunde_id
WHERE jsonb_array_length(COALESCE(f.angebote, '[]'::jsonb)) > 0
ORDER BY f.aktualisiert_am DESC
LIMIT 5;