
CREATE TABLE public.kunde_dokumente (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kontakt_id UUID NOT NULL REFERENCES public.kontakte(id) ON DELETE CASCADE,
  investment_id UUID REFERENCES public.investments(id) ON DELETE SET NULL,
  parent_id UUID REFERENCES public.kunde_dokumente(id) ON DELETE CASCADE,
  typ TEXT NOT NULL CHECK (typ IN ('ordner','datei')),
  name TEXT NOT NULL,
  groesse_bytes BIGINT,
  mime_type TEXT,
  storage_path TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  erstellt_von UUID,
  erstellt_am TIMESTAMPTZ NOT NULL DEFAULT now(),
  aktualisiert_am TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_kunde_dokumente_kontakt ON public.kunde_dokumente(kontakt_id);
CREATE INDEX idx_kunde_dokumente_investment ON public.kunde_dokumente(investment_id);
CREATE INDEX idx_kunde_dokumente_parent ON public.kunde_dokumente(parent_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.kunde_dokumente TO authenticated;
GRANT ALL ON public.kunde_dokumente TO service_role;

ALTER TABLE public.kunde_dokumente ENABLE ROW LEVEL SECURITY;

-- Helper: prüft, ob der aktuelle Nutzer Admin oder zuständiger VP des Kontakts ist
CREATE OR REPLACE FUNCTION public.can_manage_kunde_dokumente(_kontakt_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_admin_role(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.kontakte k
      WHERE k.id = _kontakt_id
        AND public.is_vp_owner_of_kontakt(auth.uid(), k.zustaendig_id, k.meta)
    );
$$;

GRANT EXECUTE ON FUNCTION public.can_manage_kunde_dokumente(UUID) TO authenticated, service_role;

CREATE POLICY "kunde_dokumente_select" ON public.kunde_dokumente
  FOR SELECT TO authenticated
  USING (public.can_manage_kunde_dokumente(kontakt_id));

CREATE POLICY "kunde_dokumente_insert" ON public.kunde_dokumente
  FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_kunde_dokumente(kontakt_id));

CREATE POLICY "kunde_dokumente_update" ON public.kunde_dokumente
  FOR UPDATE TO authenticated
  USING (public.can_manage_kunde_dokumente(kontakt_id))
  WITH CHECK (public.can_manage_kunde_dokumente(kontakt_id));

CREATE POLICY "kunde_dokumente_delete" ON public.kunde_dokumente
  FOR DELETE TO authenticated
  USING (public.can_manage_kunde_dokumente(kontakt_id));

CREATE TRIGGER trg_kunde_dokumente_updated
  BEFORE UPDATE ON public.kunde_dokumente
  FOR EACH ROW EXECUTE FUNCTION public.update_aktualisiert_am_column();
