
-- Shared app config table for company-wide settings (Präsentation, Ansprechpartner etc.)
CREATE TABLE IF NOT EXISTS public.app_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schluessel text UNIQUE NOT NULL,
  wert jsonb DEFAULT '{}',
  aktualisiert_am timestamptz DEFAULT now()
);

ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Alle lesen config" ON public.app_config FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth schreiben config" ON public.app_config FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth aktualisieren config" ON public.app_config FOR UPDATE TO authenticated USING (true);
