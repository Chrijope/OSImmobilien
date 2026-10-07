
-- Fix wohnung image URLs by matching storage files in bilder/ subdirectory to meta.bilder
-- This repairs existing wohnungen where images were uploaded but URLs weren't saved

DO $$
DECLARE
  w_row RECORD;
  s_row RECORD;
  new_bilder JSONB;
  file_url TEXT;
  bild_id TEXT;
  base_url TEXT := 'https://wyuckimzyvkrtyupkvdk.supabase.co/storage/v1/object/public/unterlagen/';
  idx INT;
BEGIN
  FOR w_row IN 
    SELECT w.id, w.objekt_id, w.meta
    FROM wohnungen w
    WHERE w.meta IS NOT NULL
  LOOP
    -- Check if there are storage files for this wohnung's bilder
    new_bilder := '[]'::jsonb;
    idx := 0;
    
    FOR s_row IN 
      SELECT name 
      FROM storage.objects 
      WHERE bucket_id = 'unterlagen'
        AND name LIKE 'objekte/' || w_row.objekt_id || '/wohnungen/' || w_row.id || '/bilder/%'
      ORDER BY name
    LOOP
      file_url := base_url || s_row.name;
      -- Extract bild_id from filename (e.g., wimg-1234567-abcd.jpeg -> wimg-1234567-abcd)
      bild_id := regexp_replace(split_part(s_row.name, '/', -1), '\.[^.]+$', '');
      
      new_bilder := new_bilder || jsonb_build_object(
        'id', bild_id,
        'url', file_url,
        'alt', '',
        'reihenfolge', idx
      );
      idx := idx + 1;
    END LOOP;
    
    -- Only update if we found bilder AND current bilder is empty
    IF idx > 0 AND (w_row.meta->'bilder' IS NULL OR jsonb_array_length(COALESCE(w_row.meta->'bilder', '[]'::jsonb)) = 0) THEN
      UPDATE wohnungen 
      SET meta = jsonb_set(COALESCE(meta, '{}'::jsonb), '{bilder}', new_bilder)
      WHERE id = w_row.id;
      RAISE NOTICE 'Fixed bilder for wohnung % with % images', w_row.id, idx;
    END IF;
  END LOOP;
END $$;
