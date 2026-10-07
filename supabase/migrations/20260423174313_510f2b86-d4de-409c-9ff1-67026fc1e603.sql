
-- Tabelle für Academy-Fortschritt je Nutzer
CREATE TABLE IF NOT EXISTS public.academy_progress (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  role TEXT NOT NULL,
  current_module_index INTEGER NOT NULL DEFAULT 0,
  completed_modules JSONB NOT NULL DEFAULT '[]'::jsonb,
  quiz_attempts JSONB NOT NULL DEFAULT '[]'::jsonb,
  passed_at TIMESTAMP WITH TIME ZONE,
  passed_score INTEGER,
  certificate_serial TEXT UNIQUE,
  certificate_pdf_url TEXT,
  certificate_issued_at TIMESTAMP WITH TIME ZONE,
  erstellt_am TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  aktualisiert_am TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_academy_progress_user ON public.academy_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_academy_progress_passed ON public.academy_progress(passed_at) WHERE passed_at IS NOT NULL;

ALTER TABLE public.academy_progress ENABLE ROW LEVEL SECURITY;

-- Nutzer sehen nur ihren eigenen Fortschritt
CREATE POLICY "Nutzer sehen eigenen Academy-Fortschritt"
  ON public.academy_progress FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR is_admin_role(auth.uid()));

CREATE POLICY "Nutzer erstellen eigenen Academy-Fortschritt"
  ON public.academy_progress FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Nutzer aktualisieren eigenen Academy-Fortschritt"
  ON public.academy_progress FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id OR is_admin_role(auth.uid()));

CREATE POLICY "Admins loeschen Academy-Fortschritt"
  ON public.academy_progress FOR DELETE
  TO authenticated
  USING (is_admin_role(auth.uid()));

-- Auto-Update Timestamp
CREATE OR REPLACE FUNCTION public.update_academy_progress_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.aktualisiert_am = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS academy_progress_updated_at ON public.academy_progress;
CREATE TRIGGER academy_progress_updated_at
  BEFORE UPDATE ON public.academy_progress
  FOR EACH ROW
  EXECUTE FUNCTION public.update_academy_progress_timestamp();

-- Storage-Bucket für Zertifikate (privat)
INSERT INTO storage.buckets (id, name, public)
VALUES ('zertifikate', 'zertifikate', false)
ON CONFLICT (id) DO NOTHING;

-- RLS für Zertifikate: Nutzer sehen nur eigene PDFs
CREATE POLICY "Nutzer sehen eigene Zertifikate"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'zertifikate' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Nutzer laden eigene Zertifikate hoch"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'zertifikate' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Nutzer ueberschreiben eigene Zertifikate"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'zertifikate' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Admins sehen alle Zertifikate"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'zertifikate' AND is_admin_role(auth.uid()));
