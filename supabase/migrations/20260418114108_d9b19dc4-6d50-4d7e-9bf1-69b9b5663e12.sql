
-- 1) Erweiterung unterlagen_dokumente
ALTER TABLE public.unterlagen_dokumente
  ADD COLUMN IF NOT EXISTS aktion text,
  ADD COLUMN IF NOT EXISTS interne_route text,
  ADD COLUMN IF NOT EXISTS pdf_key text,
  ADD COLUMN IF NOT EXISTS tool_key text,
  ADD COLUMN IF NOT EXISTS beschreibung text,
  ADD COLUMN IF NOT EXISTS gesperrt boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS nur_admin boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS slug text;

-- 2) Rechnungs-Stammdaten je Nutzer
CREATE TABLE IF NOT EXISTS public.rechnung_stammdaten (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  firma text,
  vorname text,
  nachname text,
  strasse text,
  plz text,
  ort text,
  telefon text,
  email text,
  steuernummer text,
  ust_id text,
  kleinunternehmer boolean DEFAULT true,
  iban text,
  bic text,
  bank_name text,
  kontoinhaber text,
  logo_url text,
  nummern_modus text DEFAULT 'auto',
  nummern_praefix text DEFAULT '',
  letzte_nummer integer DEFAULT 0,
  zahlungsziel_tage integer DEFAULT 14,
  fusszeile text,
  aktualisiert_am timestamptz DEFAULT now()
);

ALTER TABLE public.rechnung_stammdaten ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Nutzer sehen eigene Stammdaten"
  ON public.rechnung_stammdaten FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR is_admin_role(auth.uid()));

CREATE POLICY "Nutzer aendern eigene Stammdaten"
  ON public.rechnung_stammdaten FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Nutzer erstellen eigene Stammdaten"
  ON public.rechnung_stammdaten FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- 3) Rechnungen (Verlauf)
CREATE TABLE IF NOT EXISTS public.rechnungen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nummer text NOT NULL,
  rechnungsdatum date DEFAULT current_date,
  leistungsdatum date,
  empfaenger_firma text,
  empfaenger_anschrift text,
  positionen jsonb DEFAULT '[]'::jsonb,
  netto_summe numeric DEFAULT 0,
  ust_summe numeric DEFAULT 0,
  brutto_summe numeric DEFAULT 0,
  pdf_url text,
  status text DEFAULT 'erstellt',
  versendet_an jsonb DEFAULT '[]'::jsonb,
  versendet_am timestamptz,
  notizen text,
  erstellt_am timestamptz DEFAULT now()
);

ALTER TABLE public.rechnungen ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Nutzer sehen eigene Rechnungen"
  ON public.rechnungen FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR is_admin_role(auth.uid()));

CREATE POLICY "Nutzer erstellen eigene Rechnungen"
  ON public.rechnungen FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Nutzer aendern eigene Rechnungen"
  ON public.rechnungen FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

-- 4) Storage-Buckets
INSERT INTO storage.buckets (id, name, public)
VALUES ('rechnung-logos', 'rechnung-logos', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('rechnungen-pdf', 'rechnungen-pdf', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('wissenswert-pdf', 'wissenswert-pdf', true)
ON CONFLICT (id) DO NOTHING;

-- Logo-Bucket policies
CREATE POLICY "Logos sind oeffentlich lesbar"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'rechnung-logos');

CREATE POLICY "Nutzer laden eigene Logos hoch"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'rechnung-logos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Nutzer aendern eigene Logos"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'rechnung-logos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Nutzer loeschen eigene Logos"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'rechnung-logos' AND auth.uid()::text = (storage.foldername(name))[1]);

-- PDF-Bucket policies
CREATE POLICY "Rechnungen-PDF oeffentlich lesbar"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'rechnungen-pdf');

CREATE POLICY "Nutzer laden eigene Rechnungs-PDFs hoch"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'rechnungen-pdf' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Wissenswert-PDF Bucket policies
CREATE POLICY "Wissenswert-PDFs oeffentlich lesbar"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'wissenswert-pdf');

CREATE POLICY "Admins laden Wissenswert-PDFs hoch"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'wissenswert-pdf' AND is_admin_role(auth.uid()));

CREATE POLICY "Admins aendern Wissenswert-PDFs"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'wissenswert-pdf' AND is_admin_role(auth.uid()));

-- Trigger: aktualisiert_am auto-update fuer rechnung_stammdaten
CREATE OR REPLACE FUNCTION public.update_rechnung_stammdaten_ts()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.aktualisiert_am = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS rechnung_stammdaten_set_ts ON public.rechnung_stammdaten;
CREATE TRIGGER rechnung_stammdaten_set_ts
  BEFORE UPDATE ON public.rechnung_stammdaten
  FOR EACH ROW EXECUTE FUNCTION public.update_rechnung_stammdaten_ts();
