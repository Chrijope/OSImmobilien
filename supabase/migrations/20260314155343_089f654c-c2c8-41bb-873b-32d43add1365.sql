
-- Wohnungs-Bilder (falls nicht existiert)
CREATE TABLE IF NOT EXISTS public.wohnungs_bilder (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wohnung_id uuid NOT NULL,
  url text NOT NULL,
  alt text DEFAULT '',
  reihenfolge integer DEFAULT 0,
  erstellt_am timestamptz DEFAULT now()
);

ALTER TABLE public.wohnungs_bilder ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'wohnungs_bilder' AND policyname = 'Alle sehen WohnungsBilder') THEN
    CREATE POLICY "Alle sehen WohnungsBilder" ON public.wohnungs_bilder FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'wohnungs_bilder' AND policyname = 'Auth erstellen WohnungsBilder') THEN
    CREATE POLICY "Auth erstellen WohnungsBilder" ON public.wohnungs_bilder FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'wohnungs_bilder' AND policyname = 'Auth bearbeiten WohnungsBilder') THEN
    CREATE POLICY "Auth bearbeiten WohnungsBilder" ON public.wohnungs_bilder FOR UPDATE TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'wohnungs_bilder' AND policyname = 'Auth loeschen WohnungsBilder') THEN
    CREATE POLICY "Auth loeschen WohnungsBilder" ON public.wohnungs_bilder FOR DELETE TO authenticated USING (true);
  END IF;
END $$;

-- Wohnungs-Dokumente (falls nicht existiert)
CREATE TABLE IF NOT EXISTS public.wohnungs_dokumente (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wohnung_id uuid NOT NULL,
  name text NOT NULL,
  url text DEFAULT '',
  kategorie text DEFAULT 'wohnungsunterlagen',
  erstellt_am timestamptz DEFAULT now()
);

ALTER TABLE public.wohnungs_dokumente ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'wohnungs_dokumente' AND policyname = 'Alle sehen WohnungsDokumente') THEN
    CREATE POLICY "Alle sehen WohnungsDokumente" ON public.wohnungs_dokumente FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'wohnungs_dokumente' AND policyname = 'Auth erstellen WohnungsDokumente') THEN
    CREATE POLICY "Auth erstellen WohnungsDokumente" ON public.wohnungs_dokumente FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'wohnungs_dokumente' AND policyname = 'Auth bearbeiten WohnungsDokumente') THEN
    CREATE POLICY "Auth bearbeiten WohnungsDokumente" ON public.wohnungs_dokumente FOR UPDATE TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'wohnungs_dokumente' AND policyname = 'Auth loeschen WohnungsDokumente') THEN
    CREATE POLICY "Auth loeschen WohnungsDokumente" ON public.wohnungs_dokumente FOR DELETE TO authenticated USING (true);
  END IF;
END $$;

-- Signatur-Anfragen (für Selbstauskunft EES-Prozess)
CREATE TABLE IF NOT EXISTS public.signature_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kontakt_id uuid NOT NULL,
  investment_id text DEFAULT NULL,
  person_type text NOT NULL DEFAULT 'person1',
  token text NOT NULL UNIQUE,
  email text NOT NULL,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  signed_at timestamptz DEFAULT NULL,
  signature_data text DEFAULT NULL,
  ip_address text DEFAULT NULL,
  user_agent text DEFAULT NULL,
  consent_text text DEFAULT NULL,
  sa_data jsonb DEFAULT '{}'::jsonb
);

ALTER TABLE public.signature_requests ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'signature_requests' AND policyname = 'Oeffentlich lesen per Token') THEN
    CREATE POLICY "Oeffentlich lesen per Token" ON public.signature_requests FOR SELECT TO anon, authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'signature_requests' AND policyname = 'Auth erstellen Signatur') THEN
    CREATE POLICY "Auth erstellen Signatur" ON public.signature_requests FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'signature_requests' AND policyname = 'Oeffentlich aktualisieren Signatur') THEN
    CREATE POLICY "Oeffentlich aktualisieren Signatur" ON public.signature_requests FOR UPDATE TO anon, authenticated USING (true);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_signature_requests_token ON public.signature_requests (token);
CREATE INDEX IF NOT EXISTS idx_signature_requests_kontakt ON public.signature_requests (kontakt_id);
