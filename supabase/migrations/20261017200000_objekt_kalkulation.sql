-- Projektkalkulation je Objekt (17.10.2026, Objektdaten „Marge & Abverkauf“).
--
-- Ankaufpreis, Kosten der Aufteilung, Sanierung und Provisionssatz ergeben
-- die Marge je Einheit. `objekte.meta` liest jede interne Rolle, auch
-- Vertriebspartner; die Zahlen liegen deshalb in einer eigenen Tabelle.
-- Lesen, anlegen und ändern dürfen nur:
--   - Admin und Inhaber, alle Objekte;
--   - der Objektpartner, nur an seinen eigenen Objekten (`objekte.erstellt_von`).
-- Das Backoffice sieht keine Margen (Vorgabe Christian). Löschen nur Admin
-- und Inhaber; mit dem Objekt verschwindet die Zeile von selbst.
--
-- Neue, leere Tabelle; ändert keine Bestandsdaten.

CREATE TABLE IF NOT EXISTS public.objekt_kalkulation (
  objekt_id uuid PRIMARY KEY REFERENCES public.objekte(id) ON DELETE CASCADE,
  daten jsonb NOT NULL DEFAULT '{}'::jsonb,
  geaendert_am timestamptz NOT NULL DEFAULT now(),
  geaendert_von uuid DEFAULT auth.uid()
);

ALTER TABLE public.objekt_kalkulation ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.darf_kalkulation(_user_id uuid, _objekt uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
     WHERE user_id = _user_id
       AND role IN ('admin', 'inhaber')
  )
  OR (
    public.has_role(_user_id, 'objektpartner'::public.app_role)
    AND EXISTS (
      SELECT 1 FROM public.objekte o
       WHERE o.id = _objekt AND o.erstellt_von = _user_id
    )
  )
$$;

REVOKE ALL ON FUNCTION public.darf_kalkulation(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.darf_kalkulation(uuid, uuid) TO authenticated;

REVOKE ALL ON public.objekt_kalkulation FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.objekt_kalkulation TO authenticated;

CREATE POLICY "Kalkulation lesen" ON public.objekt_kalkulation
  FOR SELECT TO authenticated
  USING (public.darf_kalkulation(auth.uid(), objekt_id));

CREATE POLICY "Kalkulation anlegen" ON public.objekt_kalkulation
  FOR INSERT TO authenticated
  WITH CHECK (public.darf_kalkulation(auth.uid(), objekt_id));

CREATE POLICY "Kalkulation aendern" ON public.objekt_kalkulation
  FOR UPDATE TO authenticated
  USING (public.darf_kalkulation(auth.uid(), objekt_id))
  WITH CHECK (public.darf_kalkulation(auth.uid(), objekt_id));

CREATE POLICY "Kalkulation loeschen" ON public.objekt_kalkulation
  FOR DELETE TO authenticated
  USING (public.is_admin_role(auth.uid()));
