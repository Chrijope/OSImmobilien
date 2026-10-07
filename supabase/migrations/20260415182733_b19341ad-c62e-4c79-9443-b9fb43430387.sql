SELECT k.id AS kontakt_id, i.id AS investment_id, f.id AS finanzierung_id, f.kunde_id AS finanzierung_kunde_id, jsonb_array_length(COALESCE(f.angebote, '[]'::jsonb)) AS angebote_anzahl
FROM public.kontakte k
LEFT JOIN public.investments i ON i.kunde_id = k.id::text
LEFT JOIN public.finanzierungen f ON f.kunde_id = i.id::text
WHERE k.id = 'cae82bf9-29a8-44b2-9c74-c892df5498ac'::uuid;