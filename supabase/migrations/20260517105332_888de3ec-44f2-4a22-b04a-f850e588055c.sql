DROP POLICY IF EXISTS "Anyone can view avatars" ON storage.objects;
DROP POLICY IF EXISTS "avatars_auth_read" ON storage.objects;
DROP POLICY IF EXISTS "Public read access academy" ON storage.objects;
DROP POLICY IF EXISTS "academy_auth_read" ON storage.objects;
DROP POLICY IF EXISTS "objekt_medien_public_read" ON storage.objects;
DROP POLICY IF EXISTS "Public read email assets" ON storage.objects;
DROP POLICY IF EXISTS "Alle sehen Ansprechpartner-Bilder" ON storage.objects;
DROP POLICY IF EXISTS "Logos sind oeffentlich lesbar" ON storage.objects;

CREATE POLICY "Authenticated list avatars"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'avatars');

CREATE POLICY "Authenticated list academy"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'academy');

CREATE POLICY "Authenticated list objekt-medien"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'objekt-medien');

CREATE POLICY "Authenticated list email-assets"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'email-assets');

CREATE POLICY "Authenticated list ansprechpartner"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'ansprechpartner');

CREATE POLICY "Authenticated list rechnung-logos"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'rechnung-logos');