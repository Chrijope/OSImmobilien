
CREATE OR REPLACE FUNCTION public.set_vp_bewertungen_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE public.vp_bewertungen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kontakt_id uuid NOT NULL,
  vp_user_id uuid,
  vp_name text,
  kunde_name text,
  bewertet_von uuid NOT NULL,
  r_informationen smallint NOT NULL CHECK (r_informationen BETWEEN 1 AND 4),
  r_arbeitsweise smallint NOT NULL CHECK (r_arbeitsweise BETWEEN 1 AND 4),
  r_ziele smallint NOT NULL CHECK (r_ziele BETWEEN 1 AND 4),
  r_produkt smallint NOT NULL CHECK (r_produkt BETWEEN 1 AND 4),
  r_beratungsart smallint NOT NULL CHECK (r_beratungsart BETWEEN 1 AND 4),
  r_berater_erfahrung smallint NOT NULL CHECK (r_berater_erfahrung BETWEEN 1 AND 4),
  gelohnt boolean,
  weiterempfehlung boolean,
  kommentar text,
  datenschutz_akzeptiert boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kontakt_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vp_bewertungen TO authenticated;
GRANT ALL ON public.vp_bewertungen TO service_role;

ALTER TABLE public.vp_bewertungen ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Kunde sieht eigene Bewertung"
  ON public.vp_bewertungen FOR SELECT TO authenticated
  USING (bewertet_von = auth.uid());

CREATE POLICY "Kunde legt eigene Bewertung an"
  ON public.vp_bewertungen FOR INSERT TO authenticated
  WITH CHECK (bewertet_von = auth.uid());

CREATE POLICY "VP sieht eigene Bewertungen"
  ON public.vp_bewertungen FOR SELECT TO authenticated
  USING (vp_user_id = auth.uid());

CREATE POLICY "Qualitaetsmanagement sieht alle Bewertungen"
  ON public.vp_bewertungen FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'inhaber'::app_role)
    OR public.has_role(auth.uid(), 'vertriebsleiter'::app_role)
    OR public.has_role(auth.uid(), 'backoffice'::app_role)
  );

CREATE POLICY "Admin update Bewertungen"
  ON public.vp_bewertungen FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'inhaber'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'inhaber'::app_role));

CREATE POLICY "Admin delete Bewertungen"
  ON public.vp_bewertungen FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'inhaber'::app_role));

CREATE INDEX idx_vp_bewertungen_vp ON public.vp_bewertungen(vp_user_id);
CREATE INDEX idx_vp_bewertungen_kontakt ON public.vp_bewertungen(kontakt_id);

CREATE TRIGGER update_vp_bewertungen_updated_at
  BEFORE UPDATE ON public.vp_bewertungen
  FOR EACH ROW EXECUTE FUNCTION public.set_vp_bewertungen_updated_at();
