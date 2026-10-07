
-- Create storage bucket for Selbstauskunft PDFs
INSERT INTO storage.buckets (id, name, public)
VALUES ('selbstauskunft-pdfs', 'selbstauskunft-pdfs', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access
CREATE POLICY "Public read access for selbstauskunft PDFs"
ON storage.objects FOR SELECT
USING (bucket_id = 'selbstauskunft-pdfs');

-- Allow authenticated insert
CREATE POLICY "Allow insert for selbstauskunft PDFs"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'selbstauskunft-pdfs');
