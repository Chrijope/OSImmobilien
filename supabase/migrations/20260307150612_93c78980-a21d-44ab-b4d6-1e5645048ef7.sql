INSERT INTO storage.buckets (id, name, public) VALUES ('academy', 'academy', true) ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read access academy" ON storage.objects FOR SELECT USING (bucket_id = 'academy');
CREATE POLICY "Authenticated upload academy" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'academy');
CREATE POLICY "Authenticated update academy" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'academy');
CREATE POLICY "Authenticated delete academy" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'academy');