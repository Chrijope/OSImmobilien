DROP POLICY IF EXISTS "unterlagen_auth_read" ON storage.objects;
DROP POLICY IF EXISTS "unterlagen_auth_update" ON storage.objects;

DROP POLICY IF EXISTS "Kunde read unterlagen" ON storage.objects;
CREATE POLICY "Kunde read unterlagen"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'unterlagen'
  AND EXISTS (
    SELECT 1 FROM public.kontakte k
    WHERE (k.meta ->> 'authUserId') = auth.uid()::text
      AND (
        (storage.foldername(name))[1] = k.id::text
        OR (
          (storage.foldername(name))[1] = 'finanzierung'
          AND (storage.foldername(name))[2] = k.id::text
        )
        OR (
          (storage.foldername(name))[1] = 'kundenordner'
          AND (storage.foldername(name))[2] = k.id::text
        )
      )
  )
);

DROP POLICY IF EXISTS "Externe Investments owner read" ON storage.objects;
CREATE POLICY "Externe Investments owner read"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'unterlagen'
  AND (storage.foldername(name))[1] = 'externe-investments'
  AND EXISTS (
    SELECT 1 FROM public.externe_investments ei
    WHERE ei.id::text = (storage.foldername(name))[2]
      AND ei.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Chat participants read unterlagen" ON storage.objects;
CREATE POLICY "Chat participants read unterlagen"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'unterlagen'
  AND (storage.foldername(name))[1] = 'chat'
  AND public.is_chat_participant(auth.uid(), ((storage.foldername(name))[2])::uuid)
);

UPDATE storage.buckets SET public = false WHERE id = 'unterlagen';