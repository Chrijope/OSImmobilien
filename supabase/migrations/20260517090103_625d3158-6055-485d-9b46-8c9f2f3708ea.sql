-- E5 Stufe A: Sensible Buckets privatisieren
UPDATE storage.buckets SET public = false WHERE id IN ('selbstauskunft-pdfs', 'rechnungen-pdf', 'wissenswert-pdf');

-- Lesepolicy für selbstauskunft-pdfs: nur eingeloggte Nutzer (intern oder Kontaktinhaber)
DROP POLICY IF EXISTS "Public read access for selbstauskunft PDFs" ON storage.objects;
CREATE POLICY "SA-PDFs: authenticated read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'selbstauskunft-pdfs');

-- Lesepolicy für rechnungen-pdf: nur eigene PDFs oder Admin
DROP POLICY IF EXISTS "Rechnungen-PDF oeffentlich lesbar" ON storage.objects;
CREATE POLICY "Rechnungen-PDF: eigene oder Admin lesen"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'rechnungen-pdf'
    AND (
      is_admin_role(auth.uid())
      OR (storage.foldername(name))[1] = auth.uid()::text
    )
  );

-- Lesepolicy für wissenswert-pdf: alle eingeloggten internen Rollen
DROP POLICY IF EXISTS "Wissenswert-PDFs oeffentlich lesbar" ON storage.objects;
CREATE POLICY "Wissenswert-PDFs: intern lesen"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'wissenswert-pdf' AND is_internal_role(auth.uid()));