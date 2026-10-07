-- Vorsorge nach dem Vorfall vom 30.08.2026 (Matthias Mokross): Lesepolicies
-- der grossen, beim App-Start geladenen Tabellen werten Rollen- und
-- Nutzerpruefungen einmal pro Abfrage aus statt einmal pro Zeile.
--
-- Gleiche Technik wie bei aktivitaeten/follow_ups/activity_log
-- (20260827220000/230000): Alles, was nur vom angemeldeten Nutzer abhaengt,
-- wandert in einen Skalar-Subselect `(SELECT ...)` und wird damit als
-- InitPlan genau einmal berechnet. Die Sichtbarkeitsregeln selbst aendern
-- sich NICHT, nur die Haeufigkeit der Auswertung.
--
-- news braucht nichts: die SELECT-Policy ist USING (true).

-- ---------------------------------------------------------------------------
-- 1) chat_nachrichten: Teilnehmerpruefung als Menge statt Funktionsaufruf
--    je Zeile. Bewusst ueber eine SECURITY-DEFINER-Funktion, damit die
--    RLS-Regeln von chat_teilnehmer das Ergebnis nicht beeinflussen (die
--    bisherige Funktion is_chat_participant war ebenfalls SECURITY DEFINER).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.eigene_chat_ids(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT chat_id FROM public.chat_teilnehmer WHERE benutzer_id = _user_id
$$;

REVOKE ALL ON FUNCTION public.eigene_chat_ids(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.eigene_chat_ids(uuid) TO authenticated;

DROP POLICY IF EXISTS "Nutzer sehen Chat-Nachrichten" ON public.chat_nachrichten;
CREATE POLICY "Nutzer sehen Chat-Nachrichten" ON public.chat_nachrichten
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_admin_role(auth.uid()))
    OR chat_id IN (SELECT public.eigene_chat_ids(auth.uid()))
  );

-- ---------------------------------------------------------------------------
-- 2) vermietungen
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Interne sehen Vermietungen" ON public.vermietungen;
CREATE POLICY "Interne sehen Vermietungen" ON public.vermietungen
  FOR SELECT TO authenticated
  USING ((SELECT public.is_internal_role(auth.uid())));

-- ---------------------------------------------------------------------------
-- 3) benachrichtigungen
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Nutzer sehen eigene Benachrichtigungen" ON public.benachrichtigungen;
CREATE POLICY "Nutzer sehen eigene Benachrichtigungen" ON public.benachrichtigungen
  FOR SELECT TO authenticated
  USING (benutzer_id = (SELECT auth.uid()));

-- ---------------------------------------------------------------------------
-- 4) externe_investments
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Kunden sehen eigene externe Investments" ON public.externe_investments;
CREATE POLICY "Kunden sehen eigene externe Investments"
  ON public.externe_investments
  FOR SELECT
  USING (user_id = (SELECT auth.uid()) OR (SELECT public.is_admin_role(auth.uid())));

-- ---------------------------------------------------------------------------
-- 5) kunden_bewertungen (beide Lese-Policies)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Interne sehen alle Bewertungen" ON public.kunden_bewertungen;
CREATE POLICY "Interne sehen alle Bewertungen"
  ON public.kunden_bewertungen FOR SELECT
  TO authenticated
  USING ((SELECT public.is_internal_role(auth.uid())));

DROP POLICY IF EXISTS "Kunden sehen eigene Bewertungen" ON public.kunden_bewertungen;
CREATE POLICY "Kunden sehen eigene Bewertungen"
  ON public.kunden_bewertungen FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.kontakte k
      WHERE k.id = kunden_bewertungen.kunde_id
        AND ((k.meta ->> 'authUserId') = (SELECT auth.uid()::text)
          OR ((k.meta -> 'person2') ->> 'authUserId') = (SELECT auth.uid()::text))
    )
  );

-- ---------------------------------------------------------------------------
-- 6) objekt_einreichungen
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Interne sehen Einreichungen" ON public.objekt_einreichungen;
CREATE POLICY "Interne sehen Einreichungen" ON public.objekt_einreichungen
  FOR SELECT TO authenticated
  USING ((SELECT public.is_internal_role(auth.uid())));

-- ---------------------------------------------------------------------------
-- 7) provisionsabrechnungen
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "provisionsabrechnungen_select" ON public.provisionsabrechnungen;
CREATE POLICY "provisionsabrechnungen_select"
ON public.provisionsabrechnungen
FOR SELECT
TO authenticated
USING (
  provisionsabrechnungen.user_id = (SELECT auth.uid())
  OR (SELECT public.is_admin_role(auth.uid()))
  OR (SELECT public.has_role(auth.uid(), 'vertriebsleiter'::app_role))
  OR (SELECT public.has_role(auth.uid(), 'buchhaltung'::app_role))
);
