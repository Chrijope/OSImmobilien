-- Datenbank-Ueberlastung am 27.08.2026, Stufe 3: eigene Kontakte als Menge.
--
-- Stufe 1 (20260827210000) hat den Sequential Scan je Zeile entfernt,
-- Stufe 2 (20260827220000) die Rollenpruefungen auf einmal pro Abfrage
-- gehoben. Fuer Leitung und Fachrollen ist das Laden damit billig. Fuer
-- Vertriebspartner blieb aber pro Aktivitaetszeile ein Funktionsaufruf
-- (ist_eigener_kontakt -> Kontakt-Index -> is_vp_owner_of_kontakt ->
-- Vertretungspruefung). Bei 20000 Zeilen sind das weiterhin zigtausend
-- verschachtelte Aufrufe pro Abfrage; die Abfragen liefen in die
-- 8-Sekunden-Grenze, die Clients versuchten es erneut, und der Stau hielt
-- sich selbst am Leben (pg_stat_activity, 18:56 Uhr: 24 gleichzeitige
-- aktivitaeten-Ladevorgaenge).
--
-- Fix: Die Kontakte, die ein Nutzer sehen darf, werden EINMAL pro Abfrage
-- als Menge ermittelt. Danach ist jede Zeile nur noch ein Nachschlag in
-- dieser (gehashten) Menge. Der Rumpf von eigene_kontakt_ids ist die
-- ausgeschriebene Fassung von is_vp_owner_of_kontakt je Kontaktzeile:
-- Eigentum (zustaendig, erstelltVonId, empfehlungsgeberVpId) oder eine
-- heute laufende Vertretung laut abwesenheiten. Die Sichtbarkeitsregeln
-- selbst aendern sich nicht.

CREATE OR REPLACE FUNCTION public.eigene_kontakt_ids(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT k.id
  FROM public.kontakte k
  WHERE k.zustaendig_id = _user_id
     OR (k.meta ->> 'erstelltVonId') = _user_id::text
     OR (k.meta ->> 'empfehlungsgeberVpId') = _user_id::text
     -- Vertretung: dieselbe Bedingung wie ist_aktive_vertretung, nur einmal
     -- pro Abfrage statt einmal pro Kontaktzeile ausgewertet.
     OR k.zustaendig_id IN (
       SELECT a.user_id
       FROM public.abwesenheiten a
       WHERE a.vertretung_id = _user_id
         AND a.user_id <> _user_id
         AND (now() AT TIME ZONE 'Europe/Berlin')::date BETWEEN a.von AND a.bis
     )
$$;

REVOKE ALL ON FUNCTION public.eigene_kontakt_ids(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.eigene_kontakt_ids(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Lese-Policies: der Zeilen-Funktionsaufruf wird zum Mengen-Nachschlag.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Interne sehen Aktivitaeten (scoped)" ON public.aktivitaeten;
CREATE POLICY "Interne sehen Aktivitaeten (scoped)"
  ON public.aktivitaeten
  FOR SELECT
  USING (
    (SELECT public.is_internal_role(auth.uid()))
    AND (
      (SELECT public.hat_breiten_kontaktzugriff(auth.uid()))
      OR aktivitaeten.kunde_id IN (
        SELECT e.id::text FROM public.eigene_kontakt_ids(auth.uid()) AS e(id)
      )
    )
  );

DROP POLICY IF EXISTS "Interne sehen FollowUps (scoped)" ON public.follow_ups;
CREATE POLICY "Interne sehen FollowUps (scoped)"
  ON public.follow_ups
  FOR SELECT
  USING (
    (SELECT public.is_internal_role(auth.uid()))
    AND (
      (SELECT public.hat_breiten_kontaktzugriff(auth.uid()))
      OR follow_ups.kunde_id IN (
        SELECT e.id::text FROM public.eigene_kontakt_ids(auth.uid()) AS e(id)
      )
    )
  );

DROP POLICY IF EXISTS "activity_log_select_visible" ON public.activity_log;
CREATE POLICY "activity_log_select_visible"
  ON public.activity_log
  FOR SELECT
  TO authenticated
  USING (
    (SELECT public.hat_breiten_kontaktzugriff(auth.uid()))
    OR activity_log.actor_id = (SELECT auth.uid())
    OR activity_log.kontakt_id IN (
      SELECT e.id FROM public.eigene_kontakt_ids(auth.uid()) AS e(id)
    )
  );
