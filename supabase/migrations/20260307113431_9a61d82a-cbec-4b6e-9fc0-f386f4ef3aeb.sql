
-- Create highlights table
CREATE TABLE IF NOT EXISTS public.unterlagen_highlights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titel text NOT NULL,
  typ text NOT NULL DEFAULT 'image',
  beschreibung text,
  url text,
  bild_url text,
  verknuepfung text,
  reihenfolge int DEFAULT 0,
  erstellt_am timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.unterlagen_highlights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Highlights lesen" ON public.unterlagen_highlights FOR SELECT USING (true);
CREATE POLICY "Highlights einfügen" ON public.unterlagen_highlights FOR INSERT WITH CHECK (true);
CREATE POLICY "Highlights aktualisieren" ON public.unterlagen_highlights FOR UPDATE USING (true);
CREATE POLICY "Highlights löschen" ON public.unterlagen_highlights FOR DELETE USING (true);

-- Storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('unterlagen', 'unterlagen', true) ON CONFLICT (id) DO NOTHING;

-- Storage policies (use IF NOT EXISTS pattern)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Unterlagen public read') THEN
    CREATE POLICY "Unterlagen public read" ON storage.objects FOR SELECT USING (bucket_id = 'unterlagen');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Unterlagen upload') THEN
    CREATE POLICY "Unterlagen upload" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'unterlagen');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Unterlagen update') THEN
    CREATE POLICY "Unterlagen update" ON storage.objects FOR UPDATE USING (bucket_id = 'unterlagen');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Unterlagen delete') THEN
    CREATE POLICY "Unterlagen delete" ON storage.objects FOR DELETE USING (bucket_id = 'unterlagen');
  END IF;
END $$;

-- RLS for kategorien/dokumente
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'unterlagen_kategorien' AND policyname = 'Kategorien lesen') THEN
    CREATE POLICY "Kategorien lesen" ON public.unterlagen_kategorien FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'unterlagen_kategorien' AND policyname = 'Kategorien einfügen') THEN
    CREATE POLICY "Kategorien einfügen" ON public.unterlagen_kategorien FOR INSERT WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'unterlagen_kategorien' AND policyname = 'Kategorien aktualisieren') THEN
    CREATE POLICY "Kategorien aktualisieren" ON public.unterlagen_kategorien FOR UPDATE USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'unterlagen_kategorien' AND policyname = 'Kategorien löschen') THEN
    CREATE POLICY "Kategorien löschen" ON public.unterlagen_kategorien FOR DELETE USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'unterlagen_dokumente' AND policyname = 'Dokumente lesen') THEN
    CREATE POLICY "Dokumente lesen" ON public.unterlagen_dokumente FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'unterlagen_dokumente' AND policyname = 'Dokumente einfügen') THEN
    CREATE POLICY "Dokumente einfügen" ON public.unterlagen_dokumente FOR INSERT WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'unterlagen_dokumente' AND policyname = 'Dokumente aktualisieren') THEN
    CREATE POLICY "Dokumente aktualisieren" ON public.unterlagen_dokumente FOR UPDATE USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'unterlagen_dokumente' AND policyname = 'Dokumente löschen') THEN
    CREATE POLICY "Dokumente löschen" ON public.unterlagen_dokumente FOR DELETE USING (true);
  END IF;
END $$;
