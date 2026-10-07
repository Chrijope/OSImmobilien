WITH numbered AS (
  SELECT id, 1000 + ROW_NUMBER() OVER (ORDER BY erstellt_am) AS new_nr
  FROM public.support_tickets
  WHERE coalesce((meta->>'nummer')::int, 0) = 0
)
UPDATE public.support_tickets st
SET meta = jsonb_set(coalesce(st.meta, '{}'::jsonb), '{nummer}', to_jsonb(numbered.new_nr))
FROM numbered
WHERE st.id = numbered.id;