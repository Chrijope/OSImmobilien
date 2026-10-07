-- Drop the restrictive authenticated-only upload policy
DROP POLICY IF EXISTS "Users upload own unterlagen" ON storage.objects;

-- Drop the public (anon) upload policy  
DROP POLICY IF EXISTS "Unterlagen upload" ON storage.objects;

-- Create a new upload policy that allows all authenticated users to upload
CREATE POLICY "Authenticated upload unterlagen"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'unterlagen');

-- Also fix the update policy for authenticated users
DROP POLICY IF EXISTS "Users update own unterlagen" ON storage.objects;
DROP POLICY IF EXISTS "Unterlagen update" ON storage.objects;

CREATE POLICY "Authenticated update unterlagen"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'unterlagen');

-- Ensure authenticated users can read all unterlagen (not just own folder)
DROP POLICY IF EXISTS "Users read own unterlagen" ON storage.objects;
DROP POLICY IF EXISTS "Admins read all unterlagen" ON storage.objects;
DROP POLICY IF EXISTS "Unterlagen public read" ON storage.objects;

CREATE POLICY "Authenticated read unterlagen"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'unterlagen');