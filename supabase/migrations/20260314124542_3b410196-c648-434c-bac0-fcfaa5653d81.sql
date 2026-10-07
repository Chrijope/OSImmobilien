-- Allow authenticated users to upload to their own folder in unterlagen bucket
CREATE POLICY "Users upload own unterlagen"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'unterlagen' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Allow authenticated users to update (upsert) their own files
CREATE POLICY "Users update own unterlagen"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'unterlagen' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Allow authenticated users to read their own files
CREATE POLICY "Users read own unterlagen"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'unterlagen' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Allow admins to read all unterlagen
CREATE POLICY "Admins read all unterlagen"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'unterlagen' AND public.has_role(auth.uid(), 'admin'));