
-- Update pipeline_stufe enum to match the Kanban board columns
ALTER TYPE public.pipeline_stufe ADD VALUE IF NOT EXISTS 'neu';
ALTER TYPE public.pipeline_stufe ADD VALUE IF NOT EXISTS 'antrag';
ALTER TYPE public.pipeline_stufe ADD VALUE IF NOT EXISTS 'ruecklauf';
ALTER TYPE public.pipeline_stufe ADD VALUE IF NOT EXISTS 'vollstaendig';
ALTER TYPE public.pipeline_stufe ADD VALUE IF NOT EXISTS 'reserviert';

-- Add objekt and finanzierbarkeit columns to kontakte
ALTER TABLE public.kontakte ADD COLUMN IF NOT EXISTS objekt text;
ALTER TABLE public.kontakte ADD COLUMN IF NOT EXISTS kaufpreis numeric DEFAULT 0;
ALTER TABLE public.kontakte ADD COLUMN IF NOT EXISTS budget numeric DEFAULT 0;
ALTER TABLE public.kontakte ADD COLUMN IF NOT EXISTS finanzierbarkeit text;
ALTER TABLE public.kontakte ADD COLUMN IF NOT EXISTS berater text;
ALTER TABLE public.kontakte ADD COLUMN IF NOT EXISTS archiviert boolean DEFAULT false;
ALTER TABLE public.kontakte ADD COLUMN IF NOT EXISTS geloescht boolean DEFAULT false;

-- Lexikon table
CREATE TABLE public.lexikon (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  begriff text NOT NULL,
  buchstabe character(1) NOT NULL,
  beschreibung text NOT NULL,
  erstellt_am timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.lexikon ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Alle sehen Lexikon" ON public.lexikon FOR SELECT TO authenticated USING (true);

-- Chat tables
CREATE TABLE public.chat_gruppen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  typ text NOT NULL DEFAULT 'intern',
  erstellt_von uuid NOT NULL,
  erstellt_am timestamptz NOT NULL DEFAULT now(),
  aktualisiert_am timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.chat_gruppen ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Nutzer sehen Chats" ON public.chat_gruppen FOR SELECT TO authenticated USING (true);
CREATE POLICY "Nutzer erstellen Chats" ON public.chat_gruppen FOR INSERT TO authenticated WITH CHECK (auth.uid() = erstellt_von);
CREATE POLICY "Nutzer bearbeiten eigene Chats" ON public.chat_gruppen FOR UPDATE TO authenticated USING (auth.uid() = erstellt_von);
CREATE POLICY "Nutzer löschen eigene Chats" ON public.chat_gruppen FOR DELETE TO authenticated USING (auth.uid() = erstellt_von);

CREATE TABLE public.chat_teilnehmer (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id uuid NOT NULL REFERENCES public.chat_gruppen(id) ON DELETE CASCADE,
  benutzer_id uuid NOT NULL,
  beigetreten_am timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.chat_teilnehmer ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Nutzer sehen Teilnehmer" ON public.chat_teilnehmer FOR SELECT TO authenticated USING (true);
CREATE POLICY "Nutzer treten bei" ON public.chat_teilnehmer FOR INSERT TO authenticated WITH CHECK (auth.uid() = benutzer_id);

CREATE TABLE public.chat_nachrichten (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id uuid NOT NULL REFERENCES public.chat_gruppen(id) ON DELETE CASCADE,
  absender_id uuid NOT NULL,
  inhalt text NOT NULL,
  gesendet_am timestamptz NOT NULL DEFAULT now(),
  gelesen boolean DEFAULT false
);
ALTER TABLE public.chat_nachrichten ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Nutzer sehen Nachrichten" ON public.chat_nachrichten FOR SELECT TO authenticated USING (true);
CREATE POLICY "Nutzer senden Nachrichten" ON public.chat_nachrichten FOR INSERT TO authenticated WITH CHECK (auth.uid() = absender_id);

-- Unterlagen / Präsentation
CREATE TABLE public.unterlagen_kategorien (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  typ text NOT NULL DEFAULT 'unterlagen',
  reihenfolge integer DEFAULT 0,
  erstellt_am timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.unterlagen_kategorien ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Alle sehen Kategorien" ON public.unterlagen_kategorien FOR SELECT TO authenticated USING (true);

CREATE TABLE public.unterlagen_dokumente (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kategorie_id uuid NOT NULL REFERENCES public.unterlagen_kategorien(id) ON DELETE CASCADE,
  name text NOT NULL,
  url text,
  dateityp text DEFAULT 'pdf',
  reihenfolge integer DEFAULT 0,
  erstellt_am timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.unterlagen_dokumente ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Alle sehen Dokumente" ON public.unterlagen_dokumente FOR SELECT TO authenticated USING (true);

-- Enable realtime for chat
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_nachrichten;
