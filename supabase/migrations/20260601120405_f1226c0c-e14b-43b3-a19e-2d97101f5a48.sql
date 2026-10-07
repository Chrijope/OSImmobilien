DELETE FROM public.benachrichtigungen
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY benutzer_id, titel, COALESCE(link, '')
      ORDER BY erstellt_am ASC
    ) AS rn
    FROM public.benachrichtigungen
  ) t
  WHERE rn > 1
);