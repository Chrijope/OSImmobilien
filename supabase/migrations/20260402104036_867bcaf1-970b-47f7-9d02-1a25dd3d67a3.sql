
-- Remove the overly permissive DELETE policy
DROP POLICY IF EXISTS "Unterlagen delete" ON storage.objects;

-- Create secure DELETE policy: only internal roles or file owner
CREATE POLICY "Unterlagen delete intern"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'unterlagen'
  AND (
    is_internal_role(auth.uid())
    OR (storage.foldername(name))[1] = auth.uid()::text
  )
);
