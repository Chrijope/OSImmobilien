
-- =====================================================
-- E6: RLS-Härtung Welle 2
-- =====================================================

-- ---------- 1) Helper: ist Kontakt für internen User sichtbar? ----------
-- Admin/Inhaber/Hausverwaltung/Buchhaltung/Backoffice/Vertriebsleiter sehen alle.
-- Vertriebspartner/Setterin/Objektpartner/Finanzierungspartner/Versicherungsexperte/
-- Marketing/HR/Individuell/Testaccount nur eigene (zustaendig_id ODER erstelltVonId
-- ODER empfehlungsgeberVpId).
CREATE OR REPLACE FUNCTION public.kontakt_visible_to_internal(_user_id uuid, _kunde_id_text text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- Broad-Access Rollen sehen alles
    public.is_admin_role(_user_id)
    OR public.has_role(_user_id, 'hausverwaltung'::app_role)
    OR public.has_role(_user_id, 'buchhaltung'::app_role)
    OR public.has_role(_user_id, 'backoffice'::app_role)
    OR public.has_role(_user_id, 'vertriebsleiter'::app_role)
    OR (
      -- VP-/Setter-Scope: nur wenn kunde_id zu einem eigenen Kontakt zeigt
      _kunde_id_text IS NOT NULL
      AND _kunde_id_text <> ''
      AND _kunde_id_text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND EXISTS (
        SELECT 1 FROM public.kontakte k
        WHERE k.id::text = _kunde_id_text
          AND public.is_vp_owner_of_kontakt(_user_id, k.zustaendig_id, k.meta)
      )
    )
$$;

-- ---------- 2) empfehlungen: Kunden-Leak schließen ----------
DROP POLICY IF EXISTS "Kunden sehen eigene Empfehlungen" ON public.empfehlungen;
DROP POLICY IF EXISTS "Kunden erstellen Empfehlungen" ON public.empfehlungen;

CREATE POLICY "Kunden sehen eigene Empfehlungen"
  ON public.empfehlungen
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.kontakte k
      WHERE (k.meta ->> 'authUserId') = auth.uid()::text
        AND (
          k.id::text = (empfehlungen.meta ->> 'kontaktId')
          OR k.id::text = (empfehlungen.meta ->> 'empfehlenderKundeId')
        )
    )
  );

CREATE POLICY "Kunden erstellen eigene Empfehlungen"
  ON public.empfehlungen
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.kontakte k
      WHERE (k.meta ->> 'authUserId') = auth.uid()::text
        AND (
          k.id::text = (empfehlungen.meta ->> 'kontaktId')
          OR k.id::text = (empfehlungen.meta ->> 'empfehlenderKundeId')
        )
    )
  );

-- ---------- 3) aktivitaeten: VP-Scoping ----------
DROP POLICY IF EXISTS "Interne sehen Aktivitaeten" ON public.aktivitaeten;
DROP POLICY IF EXISTS "Interne bearbeiten Aktivitaeten" ON public.aktivitaeten;
DROP POLICY IF EXISTS "Interne loeschen Aktivitaeten" ON public.aktivitaeten;

CREATE POLICY "Interne sehen Aktivitaeten (scoped)"
  ON public.aktivitaeten
  FOR SELECT
  USING (
    public.is_internal_role(auth.uid())
    AND public.kontakt_visible_to_internal(auth.uid(), aktivitaeten.kunde_id)
  );

CREATE POLICY "Interne bearbeiten Aktivitaeten (scoped)"
  ON public.aktivitaeten
  FOR UPDATE
  USING (
    public.is_internal_role(auth.uid())
    AND public.kontakt_visible_to_internal(auth.uid(), aktivitaeten.kunde_id)
  );

CREATE POLICY "Interne loeschen Aktivitaeten (scoped)"
  ON public.aktivitaeten
  FOR DELETE
  USING (
    public.is_internal_role(auth.uid())
    AND public.kontakt_visible_to_internal(auth.uid(), aktivitaeten.kunde_id)
  );

-- ---------- 4) follow_ups: VP-Scoping ----------
DROP POLICY IF EXISTS "Interne sehen FollowUps" ON public.follow_ups;
DROP POLICY IF EXISTS "Interne bearbeiten FollowUps" ON public.follow_ups;
DROP POLICY IF EXISTS "Interne loeschen FollowUps" ON public.follow_ups;

CREATE POLICY "Interne sehen FollowUps (scoped)"
  ON public.follow_ups
  FOR SELECT
  USING (
    public.is_internal_role(auth.uid())
    AND public.kontakt_visible_to_internal(auth.uid(), follow_ups.kunde_id)
  );

CREATE POLICY "Interne bearbeiten FollowUps (scoped)"
  ON public.follow_ups
  FOR UPDATE
  USING (
    public.is_internal_role(auth.uid())
    AND public.kontakt_visible_to_internal(auth.uid(), follow_ups.kunde_id)
  );

CREATE POLICY "Interne loeschen FollowUps (scoped)"
  ON public.follow_ups
  FOR DELETE
  USING (
    public.is_internal_role(auth.uid())
    AND public.kontakt_visible_to_internal(auth.uid(), follow_ups.kunde_id)
  );

-- ---------- 5) kommunikation: VP-Scoping ----------
-- kommunikation hat keinen direkten kunde_id, aber meta.kunde_id wird genutzt.
DROP POLICY IF EXISTS "Interne sehen Kommunikation" ON public.kommunikation;
DROP POLICY IF EXISTS "Interne bearbeiten Kommunikation" ON public.kommunikation;

CREATE POLICY "Interne sehen Kommunikation (scoped)"
  ON public.kommunikation
  FOR SELECT
  USING (
    public.is_internal_role(auth.uid())
    AND public.kontakt_visible_to_internal(auth.uid(), kommunikation.meta ->> 'kunde_id')
  );

CREATE POLICY "Interne bearbeiten Kommunikation (scoped)"
  ON public.kommunikation
  FOR UPDATE
  USING (
    public.is_internal_role(auth.uid())
    AND public.kontakt_visible_to_internal(auth.uid(), kommunikation.meta ->> 'kunde_id')
  );
