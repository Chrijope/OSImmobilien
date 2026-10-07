
-- Fix wohnung document URLs by matching storage files to meta.dokumente entries
-- This repairs existing wohnungen where files were uploaded but URLs weren't saved

DO $$
DECLARE
  w_row RECORD;
  s_row RECORD;
  doc_entry JSONB;
  new_dokumente JSONB;
  doc_id TEXT;
  doc_name TEXT;
  file_url TEXT;
  updated BOOLEAN;
  doc_map JSONB := '{"wd1":"Wohnfläche","wd2":"Grundriss","wd4":"Wohnungsbilder","wd5":"Renovierung WE","wd6":"Mietvertrag","wd7":"Wirtschaftsplan","wd8":"Hausgeld","wd9":"GBA Wohnung"}'::jsonb;
  base_url TEXT := 'https://wyuckimzyvkrtyupkvdk.supabase.co/storage/v1/object/public/unterlagen/';
BEGIN
  FOR w_row IN 
    SELECT w.id, w.objekt_id, w.meta
    FROM wohnungen w
    WHERE w.meta IS NOT NULL
  LOOP
    new_dokumente := w_row.meta->'dokumente';
    IF new_dokumente IS NULL THEN CONTINUE; END IF;
    
    updated := FALSE;
    
    FOR i IN 0..jsonb_array_length(new_dokumente)-1 LOOP
      doc_entry := new_dokumente->i;
      -- Skip if already has URL
      IF (doc_entry->>'url') IS NOT NULL AND (doc_entry->>'url') != '' THEN CONTINUE; END IF;
      
      doc_name := doc_entry->>'name';
      
      -- Find matching doc_id from map
      FOR doc_id IN SELECT key FROM jsonb_each_text(doc_map) WHERE value = doc_name LOOP
        -- Check if storage file exists
        SELECT name INTO s_row
        FROM storage.objects
        WHERE bucket_id = 'unterlagen'
          AND name LIKE 'objekte/' || w_row.objekt_id || '/wohnungen/' || w_row.id || '/' || doc_id || '_%'
          AND name NOT LIKE '%/bilder/%'
        LIMIT 1;
        
        IF FOUND THEN
          file_url := base_url || s_row.name;
          new_dokumente := jsonb_set(new_dokumente, ARRAY[i::text, 'url'], to_jsonb(file_url));
          updated := TRUE;
          RAISE NOTICE 'Fixed % doc % -> %', w_row.id, doc_name, file_url;
        END IF;
      END LOOP;
    END LOOP;
    
    IF updated THEN
      UPDATE wohnungen SET meta = jsonb_set(COALESCE(meta, '{}'::jsonb), '{dokumente}', new_dokumente) WHERE id = w_row.id;
    END IF;
  END LOOP;
END $$;
