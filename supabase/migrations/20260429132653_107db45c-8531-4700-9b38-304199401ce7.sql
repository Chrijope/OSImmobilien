-- Storage bucket for bug report attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('bug-reports', 'bug-reports', false)
ON CONFLICT (id) DO NOTHING;

-- Authenticated users can upload to their own folder
CREATE POLICY "BugReports Upload eigene"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'bug-reports' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Authenticated users can view their own uploads
CREATE POLICY "BugReports Lesen eigene"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'bug-reports' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Admins/Inhaber can view all
CREATE POLICY "BugReports Admins lesen alle"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'bug-reports'
  AND EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('admin', 'inhaber')
  )
);