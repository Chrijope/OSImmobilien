-- #5 mobile_scan_sessions aus Realtime-Publication entfernen (RPC-Only-Flow)
ALTER PUBLICATION supabase_realtime DROP TABLE public.mobile_scan_sessions;

-- #10 bewerbungen-Upload-Policy auf Vertragsordner einschränken
DROP POLICY IF EXISTS "Public can upload application documents" ON storage.objects;
CREATE POLICY "Public can upload bewerbung vertrag pdfs"
ON storage.objects
FOR INSERT
TO anon, authenticated
WITH CHECK (
  bucket_id = 'bewerbungen'
  AND (storage.foldername(name))[1] = 'vertrag'
);