-- Mieterdaten nur für die, die sie brauchen (17.10.2026).
--
-- Christian hat die Tabelle `mieter` zur Mietertabelle je Einheit gemacht
-- (Gruppe „Objektdaten“, Entwurf „Hausverwaltung“). Mieter sind Dritte ohne
-- Vertrag mit uns. Bisher durfte jede interne Rolle sie lesen und ändern
-- (`is_internal_role`), also auch Vertriebspartner, Setter und Marketing.
--
-- Künftig lesen, anlegen und ändern nur:
--   - Admin, Inhaber, Backoffice und Hausverwaltung, alle Objekte;
--   - der Objektpartner, nur an seinen eigenen Objekten (`objekte.erstellt_von`).
-- Löschen bleibt bei Admin und Inhaber (`is_admin_role`), unverändert.
--
-- `mieter.objekt` ist Text und hält die Objektkennung; ältere Zeilen ohne
-- Objekt sieht der Objektpartner deshalb nicht, die übrigen Rollen schon.

CREATE OR REPLACE FUNCTION public.darf_mieterdaten(_user_id uuid, _objekt text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
     WHERE user_id = _user_id
       AND role IN ('admin', 'inhaber', 'backoffice', 'hausverwaltung')
  )
  OR (
    public.has_role(_user_id, 'objektpartner'::public.app_role)
    AND EXISTS (
      SELECT 1 FROM public.objekte o
       WHERE o.id::text = _objekt AND o.erstellt_von = _user_id
    )
  )
$$;

REVOKE ALL ON FUNCTION public.darf_mieterdaten(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.darf_mieterdaten(uuid, text) TO authenticated;

DROP POLICY IF EXISTS "Interne sehen Mieter" ON public.mieter;
DROP POLICY IF EXISTS "Interne bearbeiten Mieter" ON public.mieter;
DROP POLICY IF EXISTS "Interne erstellen Mieter" ON public.mieter;

CREATE POLICY "Mieterdaten lesen" ON public.mieter
  FOR SELECT TO authenticated
  USING (public.darf_mieterdaten(auth.uid(), objekt));

CREATE POLICY "Mieterdaten anlegen" ON public.mieter
  FOR INSERT TO authenticated
  WITH CHECK (public.darf_mieterdaten(auth.uid(), objekt));

CREATE POLICY "Mieterdaten aendern" ON public.mieter
  FOR UPDATE TO authenticated
  USING (public.darf_mieterdaten(auth.uid(), objekt))
  WITH CHECK (public.darf_mieterdaten(auth.uid(), objekt));

-- Ist-Miete je Einheit ohne Personenbezug (Christian, 17.10.2026): Garage und
-- Mietgarantie sollen alle sehen, die die Objekt- und Einheitenseite sehen,
-- auch Vertriebspartner. Die Garantie hängt an der Ist-Kaltmiete, und die
-- steht am Mieter. Diese Funktion gibt je Einheit eines Objekts nur Kaltmiete,
-- Mietbeginn und Befristung des aktuellen Mieters heraus, keine Namen, keine
-- Kontaktdaten. „Aktuell“ wie im CRM (`aktuellerMieter`): nicht ausgezogen,
-- bei mehreren der mit dem spätesten Beginn.
CREATE OR REPLACE FUNCTION public.mietkennzahlen_je_einheit(_objekt_id uuid)
RETURNS TABLE (wohnung_id text, kaltmiete numeric, mietbeginn text, befristet_bis text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT ON (m.wohnung)
         m.wohnung, m.miete, nullif(m.einzug, ''), nullif(m.meta ->> 'mietvertragEnde', '')
    FROM public.mieter m
   WHERE public.is_internal_role(auth.uid())
     AND m.objekt = _objekt_id::text
     AND coalesce(m.wohnung, '') <> ''
     AND coalesce(m.status, 'aktiv') IN ('aktiv', 'neu', 'gekuendigt')
   ORDER BY m.wohnung, nullif(m.einzug, '') DESC NULLS LAST
$$;

REVOKE ALL ON FUNCTION public.mietkennzahlen_je_einheit(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.mietkennzahlen_je_einheit(uuid) TO authenticated;
