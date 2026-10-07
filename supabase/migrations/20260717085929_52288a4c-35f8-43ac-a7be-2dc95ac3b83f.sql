
DO $$ BEGIN
  CREATE POLICY "Praesentation-PDFs auth read"
    ON storage.objects FOR SELECT TO authenticated
    USING (bucket_id = 'praesentation-pdfs');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Praesentation-PDFs auth insert"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'praesentation-pdfs');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Praesentation-PDFs auth update"
    ON storage.objects FOR UPDATE TO authenticated
    USING (bucket_id = 'praesentation-pdfs');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
