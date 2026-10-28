-- ===========================================================================
-- Video-Studio (Marketing): Avatare und Avatar-Videos
-- ===========================================================================
--
-- Sprechende Avatar-Videos aus einem Skript, erzeugt ueber die Higgsfield-API
-- (Function video-studio). Ein Avatar ist ein Foto plus eine Stimmprobe; ein
-- Video besteht aus Clips von hoechstens 15 Sekunden, weil das Modell nicht
-- laenger erzeugt.
--
-- Vorerst nur Admin und Inhaber: Jeder Clip kostet Geld beim Anbieter.
--
-- Neue Tabellen und ein neuer Eimer, aendert nichts Bestehendes, wiederholbar.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.video_avatare (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  -- Pfade im Eimer video-studio
  bild_pfad text NOT NULL,
  stimme_pfad text,
  erstellt_von uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.video_projekte (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titel text NOT NULL,
  skript text NOT NULL,
  avatar_id uuid REFERENCES public.video_avatare(id) ON DELETE SET NULL,
  format text NOT NULL DEFAULT '9:16' CHECK (format IN ('16:9', '9:16', '1:1')),
  -- entwurf | laeuft | fertig | fehler
  status text NOT NULL DEFAULT 'entwurf',
  -- [{ text, request_id, status, video_pfad, fehler }]
  clips jsonb NOT NULL DEFAULT '[]'::jsonb,
  fehler text,
  erstellt_von uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.video_avatare ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_projekte ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS video_avatare_admin ON public.video_avatare;
CREATE POLICY video_avatare_admin ON public.video_avatare FOR ALL TO authenticated
  USING (public.is_admin_role(auth.uid())) WITH CHECK (public.is_admin_role(auth.uid()));

DROP POLICY IF EXISTS video_projekte_admin ON public.video_projekte;
CREATE POLICY video_projekte_admin ON public.video_projekte FOR ALL TO authenticated
  USING (public.is_admin_role(auth.uid())) WITH CHECK (public.is_admin_role(auth.uid()));

-- Privater Eimer: Fotos, Stimmproben, fertige Clips. 200 MB je Datei.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('video-studio', 'video-studio', false, 209715200, ARRAY[
  'image/png', 'image/jpeg', 'image/webp',
  'audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/wav', 'audio/x-wav', 'audio/webm', 'audio/ogg',
  'video/mp4'
])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS video_studio_admin ON storage.objects;
CREATE POLICY video_studio_admin ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'video-studio' AND public.is_admin_role(auth.uid()))
  WITH CHECK (bucket_id = 'video-studio' AND public.is_admin_role(auth.uid()));
