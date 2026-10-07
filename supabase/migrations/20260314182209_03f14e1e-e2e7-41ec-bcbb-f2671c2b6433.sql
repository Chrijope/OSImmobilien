
INSERT INTO storage.buckets (id, name, public) VALUES ('ansprechpartner', 'ansprechpartner', true) ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Alle sehen Ansprechpartner-Bilder" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'ansprechpartner');
CREATE POLICY "Auth laden Ansprechpartner-Bilder hoch" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'ansprechpartner');
CREATE POLICY "Auth aktualisieren Ansprechpartner-Bilder" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'ansprechpartner');
CREATE POLICY "Auth loeschen Ansprechpartner-Bilder" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'ansprechpartner');
