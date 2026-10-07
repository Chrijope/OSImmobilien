CREATE TABLE public.objektvorstellungen (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  kontakt_id UUID NOT NULL REFERENCES public.kontakte(id) ON DELETE CASCADE,
  investment_id UUID REFERENCES public.investments(id) ON DELETE SET NULL,
  token TEXT NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', ''),
  titel TEXT NOT NULL DEFAULT 'Deine persönliche Objektvorstellung',
  begruessung TEXT,
  konfig JSONB NOT NULL DEFAULT '{}'::jsonb,
  erstellt_von UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  aufrufe INTEGER NOT NULL DEFAULT 0,
  zuletzt_aufgerufen_am TIMESTAMPTZ,
  erstellt_am TIMESTAMPTZ NOT NULL DEFAULT now(),
  aktualisiert_am TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_objektvorstellungen_kontakt ON public.objektvorstellungen(kontakt_id);
CREATE INDEX idx_objektvorstellungen_token ON public.objektvorstellungen(token);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.objektvorstellungen TO authenticated;
GRANT ALL ON public.objektvorstellungen TO service_role;

ALTER TABLE public.objektvorstellungen ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin sieht alle Objektvorstellungen"
  ON public.objektvorstellungen FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'inhaber'::app_role));

CREATE POLICY "VP sieht Vorstellungen eigener Kunden"
  ON public.objektvorstellungen FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.kontakte k
    WHERE k.id = objektvorstellungen.kontakt_id
      AND (k.zustaendig_id = auth.uid() OR objektvorstellungen.erstellt_von = auth.uid())
  ));

CREATE POLICY "Admin kann Objektvorstellungen anlegen"
  ON public.objektvorstellungen FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'inhaber'::app_role));

CREATE POLICY "VP kann Vorstellungen eigener Kunden anlegen"
  ON public.objektvorstellungen FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.kontakte k
    WHERE k.id = objektvorstellungen.kontakt_id
      AND k.zustaendig_id = auth.uid()
  ));

CREATE POLICY "Admin kann Objektvorstellungen aendern"
  ON public.objektvorstellungen FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'inhaber'::app_role));

CREATE POLICY "VP kann Vorstellungen eigener Kunden aendern"
  ON public.objektvorstellungen FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.kontakte k
    WHERE k.id = objektvorstellungen.kontakt_id
      AND (k.zustaendig_id = auth.uid() OR objektvorstellungen.erstellt_von = auth.uid())
  ));

CREATE POLICY "Admin kann Objektvorstellungen loeschen"
  ON public.objektvorstellungen FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'inhaber'::app_role));

CREATE POLICY "VP kann Vorstellungen eigener Kunden loeschen"
  ON public.objektvorstellungen FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.kontakte k
    WHERE k.id = objektvorstellungen.kontakt_id
      AND (k.zustaendig_id = auth.uid() OR objektvorstellungen.erstellt_von = auth.uid())
  ));

CREATE OR REPLACE FUNCTION public.tg_objektvorstellungen_touch()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.aktualisiert_am = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_objektvorstellungen_updated
  BEFORE UPDATE ON public.objektvorstellungen
  FOR EACH ROW EXECUTE FUNCTION public.tg_objektvorstellungen_touch();