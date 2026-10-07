
-- Reports table
CREATE TABLE public.meldungen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  melder_id uuid NOT NULL,
  typ text NOT NULL DEFAULT 'chat_nachricht',
  referenz_id text NOT NULL,
  grund text NOT NULL,
  beschreibung text,
  status text NOT NULL DEFAULT 'offen',
  bearbeitet_von uuid,
  bearbeitet_am timestamptz,
  erstellt_am timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.meldungen ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth erstellen Meldungen" ON public.meldungen
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = melder_id);

CREATE POLICY "Nutzer sehen eigene Meldungen" ON public.meldungen
  FOR SELECT TO authenticated
  USING (auth.uid() = melder_id OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'inhaber'));

CREATE POLICY "Admins bearbeiten Meldungen" ON public.meldungen
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'inhaber'));

-- Moderation actions table
CREATE TABLE public.moderations_aktionen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  benutzer_id uuid NOT NULL,
  aktion text NOT NULL DEFAULT 'warnung',
  grund text NOT NULL,
  meldung_id uuid REFERENCES public.meldungen(id),
  notizen text,
  erstellt_von uuid NOT NULL,
  erstellt_am timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.moderations_aktionen ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins verwalten Aktionen" ON public.moderations_aktionen
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'inhaber'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'inhaber'));

CREATE POLICY "Nutzer sehen eigene Aktionen" ON public.moderations_aktionen
  FOR SELECT TO authenticated
  USING (auth.uid() = benutzer_id);

-- Add blocked flag to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS gesperrt boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS gesperrt_grund text;
