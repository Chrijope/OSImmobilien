
-- =============================================
-- HERZOGPARK OFFICES CRM – Datenbankschema
-- Sprache: Deutsch
-- =============================================

-- Hilfsfunktion: updated_at automatisch setzen
CREATE OR REPLACE FUNCTION public.aktualisiere_zeitstempel()
RETURNS TRIGGER AS $$
BEGIN
  NEW.aktualisiert_am = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- =============================================
-- 1. KONTAKTE (Leads, Kunden, Partner)
-- =============================================
CREATE TYPE public.kontakt_typ AS ENUM ('b2c', 'b2b');
CREATE TYPE public.kontakt_status AS ENUM ('neu', 'kontaktiert', 'qualifiziert', 'kunde', 'verloren', 'inaktiv');

CREATE TABLE public.kontakte (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  typ kontakt_typ NOT NULL DEFAULT 'b2c',
  status kontakt_status NOT NULL DEFAULT 'neu',
  anrede TEXT,
  vorname TEXT NOT NULL,
  nachname TEXT NOT NULL,
  firma TEXT,
  position TEXT,
  telefon TEXT,
  email TEXT,
  strasse TEXT,
  hausnummer TEXT,
  plz TEXT,
  ort TEXT,
  land TEXT DEFAULT 'Deutschland',
  notizen TEXT,
  quelle TEXT,
  zustaendig_id UUID REFERENCES auth.users(id),
  erstellt_am TIMESTAMPTZ NOT NULL DEFAULT now(),
  aktualisiert_am TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.kontakte ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Nutzer sehen zugewiesene Kontakte"
  ON public.kontakte FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Nutzer erstellen Kontakte"
  ON public.kontakte FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Nutzer bearbeiten zugewiesene Kontakte"
  ON public.kontakte FOR UPDATE TO authenticated
  USING (true);

CREATE TRIGGER kontakte_zeitstempel
  BEFORE UPDATE ON public.kontakte
  FOR EACH ROW EXECUTE FUNCTION public.aktualisiere_zeitstempel();

-- =============================================
-- 2. ANRUFE
-- =============================================
CREATE TYPE public.anruf_ergebnis AS ENUM ('erreicht', 'nicht_erreicht', 'mailbox', 'termin_vereinbart', 'kein_interesse', 'follow_up');

CREATE TABLE public.anrufe (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  kontakt_id UUID REFERENCES public.kontakte(id) ON DELETE CASCADE,
  benutzer_id UUID NOT NULL REFERENCES auth.users(id),
  typ kontakt_typ NOT NULL DEFAULT 'b2c',
  telefon TEXT,
  ergebnis anruf_ergebnis,
  dauer_sekunden INTEGER DEFAULT 0,
  notizen TEXT,
  angerufen_am TIMESTAMPTZ NOT NULL DEFAULT now(),
  erstellt_am TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.anrufe ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Nutzer sehen alle Anrufe"
  ON public.anrufe FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Nutzer erstellen Anrufe"
  ON public.anrufe FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = benutzer_id);

CREATE POLICY "Nutzer bearbeiten eigene Anrufe"
  ON public.anrufe FOR UPDATE TO authenticated
  USING (auth.uid() = benutzer_id);

CREATE TRIGGER anrufe_zeitstempel
  BEFORE UPDATE ON public.anrufe
  FOR EACH ROW EXECUTE FUNCTION public.aktualisiere_zeitstempel();

-- =============================================
-- 3. E-MAILS
-- =============================================
CREATE TYPE public.email_ordner AS ENUM ('posteingang', 'gesendet', 'entwuerfe', 'archiviert', 'papierkorb');

CREATE TABLE public.emails (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  benutzer_id UUID NOT NULL REFERENCES auth.users(id),
  kontakt_id UUID REFERENCES public.kontakte(id) ON DELETE SET NULL,
  ordner email_ordner NOT NULL DEFAULT 'posteingang',
  absender_name TEXT,
  absender_email TEXT,
  betreff TEXT NOT NULL,
  vorschau TEXT,
  inhalt TEXT,
  gelesen BOOLEAN NOT NULL DEFAULT false,
  markiert BOOLEAN NOT NULL DEFAULT false,
  empfangen_am TIMESTAMPTZ NOT NULL DEFAULT now(),
  erstellt_am TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Nutzer sehen eigene E-Mails"
  ON public.emails FOR SELECT TO authenticated
  USING (auth.uid() = benutzer_id);

CREATE POLICY "Nutzer erstellen E-Mails"
  ON public.emails FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = benutzer_id);

CREATE POLICY "Nutzer bearbeiten eigene E-Mails"
  ON public.emails FOR UPDATE TO authenticated
  USING (auth.uid() = benutzer_id);

CREATE POLICY "Nutzer löschen eigene E-Mails"
  ON public.emails FOR DELETE TO authenticated
  USING (auth.uid() = benutzer_id);

-- =============================================
-- 4. AUFGABEN & TERMINE
-- =============================================
CREATE TYPE public.aufgabe_typ AS ENUM ('anruf', 'meeting', 'follow_up', 'aufgabe', 'deadline');
CREATE TYPE public.aufgabe_prioritaet AS ENUM ('niedrig', 'mittel', 'hoch', 'dringend');
CREATE TYPE public.aufgabe_status AS ENUM ('offen', 'in_bearbeitung', 'erledigt', 'abgesagt');

CREATE TABLE public.aufgaben (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  benutzer_id UUID NOT NULL REFERENCES auth.users(id),
  kontakt_id UUID REFERENCES public.kontakte(id) ON DELETE SET NULL,
  typ aufgabe_typ NOT NULL DEFAULT 'aufgabe',
  prioritaet aufgabe_prioritaet NOT NULL DEFAULT 'mittel',
  status aufgabe_status NOT NULL DEFAULT 'offen',
  titel TEXT NOT NULL,
  beschreibung TEXT,
  faellig_am TIMESTAMPTZ,
  uhrzeit TIME,
  erledigt_am TIMESTAMPTZ,
  zugewiesen_an UUID REFERENCES auth.users(id),
  erstellt_am TIMESTAMPTZ NOT NULL DEFAULT now(),
  aktualisiert_am TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.aufgaben ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Nutzer sehen zugewiesene Aufgaben"
  ON public.aufgaben FOR SELECT TO authenticated
  USING (auth.uid() = benutzer_id OR auth.uid() = zugewiesen_an);

CREATE POLICY "Nutzer erstellen Aufgaben"
  ON public.aufgaben FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = benutzer_id);

CREATE POLICY "Nutzer bearbeiten eigene Aufgaben"
  ON public.aufgaben FOR UPDATE TO authenticated
  USING (auth.uid() = benutzer_id OR auth.uid() = zugewiesen_an);

CREATE TRIGGER aufgaben_zeitstempel
  BEFORE UPDATE ON public.aufgaben
  FOR EACH ROW EXECUTE FUNCTION public.aktualisiere_zeitstempel();

-- =============================================
-- 5. NEWS / MITTEILUNGEN
-- =============================================
CREATE TYPE public.news_kategorie AS ENUM ('provision', 'event', 'update', 'system', 'allgemein');

CREATE TABLE public.news (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  autor_id UUID NOT NULL REFERENCES auth.users(id),
  kategorie news_kategorie NOT NULL DEFAULT 'allgemein',
  titel TEXT NOT NULL,
  inhalt TEXT NOT NULL,
  veroeffentlicht_am TIMESTAMPTZ NOT NULL DEFAULT now(),
  erstellt_am TIMESTAMPTZ NOT NULL DEFAULT now(),
  aktualisiert_am TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.news ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Alle authentifizierten Nutzer sehen News"
  ON public.news FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins erstellen News"
  ON public.news FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Admins bearbeiten News"
  ON public.news FOR UPDATE TO authenticated
  USING (true);

CREATE POLICY "Admins löschen News"
  ON public.news FOR DELETE TO authenticated
  USING (true);

CREATE TRIGGER news_zeitstempel
  BEFORE UPDATE ON public.news
  FOR EACH ROW EXECUTE FUNCTION public.aktualisiere_zeitstempel();

-- =============================================
-- 6. BENACHRICHTIGUNGEN
-- =============================================
CREATE TABLE public.benachrichtigungen (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  benutzer_id UUID NOT NULL REFERENCES auth.users(id),
  titel TEXT NOT NULL,
  nachricht TEXT,
  gelesen BOOLEAN NOT NULL DEFAULT false,
  link TEXT,
  erstellt_am TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.benachrichtigungen ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Nutzer sehen eigene Benachrichtigungen"
  ON public.benachrichtigungen FOR SELECT TO authenticated
  USING (auth.uid() = benutzer_id);

CREATE POLICY "System erstellt Benachrichtigungen"
  ON public.benachrichtigungen FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Nutzer aktualisieren eigene Benachrichtigungen"
  ON public.benachrichtigungen FOR UPDATE TO authenticated
  USING (auth.uid() = benutzer_id);

-- =============================================
-- 7. PIPELINE (Vertriebsstufen)
-- =============================================
CREATE TYPE public.pipeline_stufe AS ENUM ('erstgespraech', 'bedarfsanalyse', 'angebot', 'verhandlung', 'abschluss', 'verloren');

CREATE TABLE public.pipeline (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  kontakt_id UUID NOT NULL REFERENCES public.kontakte(id) ON DELETE CASCADE,
  benutzer_id UUID NOT NULL REFERENCES auth.users(id),
  stufe pipeline_stufe NOT NULL DEFAULT 'erstgespraech',
  wert_euro NUMERIC(12,2) DEFAULT 0,
  wahrscheinlichkeit INTEGER DEFAULT 0,
  notizen TEXT,
  erstellt_am TIMESTAMPTZ NOT NULL DEFAULT now(),
  aktualisiert_am TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.pipeline ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Nutzer sehen alle Pipeline-Einträge"
  ON public.pipeline FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Nutzer erstellen Pipeline-Einträge"
  ON public.pipeline FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = benutzer_id);

CREATE POLICY "Nutzer bearbeiten eigene Pipeline-Einträge"
  ON public.pipeline FOR UPDATE TO authenticated
  USING (auth.uid() = benutzer_id);

CREATE TRIGGER pipeline_zeitstempel
  BEFORE UPDATE ON public.pipeline
  FOR EACH ROW EXECUTE FUNCTION public.aktualisiere_zeitstempel();

-- =============================================
-- INDIZES für Performance
-- =============================================
CREATE INDEX idx_kontakte_status ON public.kontakte(status);
CREATE INDEX idx_kontakte_typ ON public.kontakte(typ);
CREATE INDEX idx_kontakte_zustaendig ON public.kontakte(zustaendig_id);
CREATE INDEX idx_anrufe_benutzer ON public.anrufe(benutzer_id);
CREATE INDEX idx_anrufe_kontakt ON public.anrufe(kontakt_id);
CREATE INDEX idx_anrufe_datum ON public.anrufe(angerufen_am);
CREATE INDEX idx_emails_benutzer ON public.emails(benutzer_id);
CREATE INDEX idx_emails_ordner ON public.emails(ordner);
CREATE INDEX idx_aufgaben_benutzer ON public.aufgaben(benutzer_id);
CREATE INDEX idx_aufgaben_faellig ON public.aufgaben(faellig_am);
CREATE INDEX idx_aufgaben_status ON public.aufgaben(status);
CREATE INDEX idx_pipeline_kontakt ON public.pipeline(kontakt_id);
CREATE INDEX idx_pipeline_stufe ON public.pipeline(stufe);
CREATE INDEX idx_benachrichtigungen_benutzer ON public.benachrichtigungen(benutzer_id);
