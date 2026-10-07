-- Datenbank-Ueberlastung am 27.08.2026: Rollenpruefung einmal pro Abfrage.
--
-- Befund aus pg_stat_activity: Rund 20 gleichzeitige Ladevorgaenge der
-- Tabelle aktivitaeten, jeder mehrere Sekunden aktiv, sättigen die Datenbank
-- so, dass selbst einzeilige Abfragen 8 bis 17 Sekunden brauchen und die App
-- fuer alle Nutzer in die Zeitgrenzen laeuft.
--
-- Ursache: Die Lese-Policies rufen kontakt_visible_to_internal fuer JEDE
-- Zeile auf. Die Funktion ist SECURITY DEFINER und damit fuer den Planer
-- eine Blackbox, sie kann nicht vorgezogen werden. Pro Zeile laufen so bis
-- zu sechs Rollen-Unterabfragen (is_internal_role, is_admin_role, viermal
-- has_role), bei 20000 Aktivitaetszeilen ueber 100000 Funktionsaufrufe pro
-- einzelnem Seitenaufruf. Der Index-Fix aus 20260827210000 hat den
-- Sequential Scan entfernt, die Rollenpruefungen pro Zeile blieben.
--
-- Fix nach dem ueblichen Postgres-Muster: Alles, was nur vom angemeldeten
-- Nutzer abhaengt (nicht von der Zeile), wandert in einen Skalar-Subselect
-- `(SELECT funktion(auth.uid()))`. Den wertet Postgres als InitPlan genau
-- EINMAL pro Abfrage aus. Fuer Leitung und Fachrollen kostet die Sichtbarkeit
-- damit praktisch nichts mehr; fuer Vertriebspartner bleibt pro Zeile nur
-- noch der indexierte Blick in die Kontakttabelle.
--
-- Die Sichtbarkeitsregeln selbst aendern sich NICHT, nur wie oft sie
-- ausgewertet werden.

-- ---------------------------------------------------------------------------
-- 1) Breiter Zugriff: haengt nur vom Nutzer ab, nie von der Zeile.
--    Exakt die fuenf Rollen aus kontakt_visible_to_internal.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.hat_breiten_kontaktzugriff(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_admin_role(_user_id)
      OR public.has_role(_user_id, 'hausverwaltung'::app_role)
      OR public.has_role(_user_id, 'buchhaltung'::app_role)
      OR public.has_role(_user_id, 'backoffice'::app_role)
      OR public.has_role(_user_id, 'vertriebsleiter'::app_role)
$$;

REVOKE ALL ON FUNCTION public.hat_breiten_kontaktzugriff(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.hat_breiten_kontaktzugriff(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2) Eigener Kontakt: der einzige Teil, der wirklich je Zeile laufen muss.
--    Keine Rollenabfragen mehr, nur der indexierte Kontakt-Blick.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ist_eigener_kontakt(_user_id uuid, _kunde_id_text text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _kunde_id_text IS NOT NULL
     AND _kunde_id_text <> ''
     AND _kunde_id_text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     AND EXISTS (
       SELECT 1 FROM public.kontakte k
       WHERE k.id = _kunde_id_text::uuid
         AND public.is_vp_owner_of_kontakt(_user_id, k.zustaendig_id, k.meta)
     )
$$;

REVOKE ALL ON FUNCTION public.ist_eigener_kontakt(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.ist_eigener_kontakt(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3) Bisherige Funktion als Kombination der beiden Teile. Alle uebrigen
--    Aufrufer (Einzelzeilen-Policies, RPCs) behalten unveraendert dieselbe
--    Antwort.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.kontakt_visible_to_internal(_user_id uuid, _kunde_id_text text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.hat_breiten_kontaktzugriff(_user_id)
      OR public.ist_eigener_kontakt(_user_id, _kunde_id_text)
$$;

-- ---------------------------------------------------------------------------
-- 4) Lese-Policies der drei Massentabellen auf das InitPlan-Muster umstellen.
--    Gleiche Namen, gleiche Logik, nur die nutzerabhaengigen Teile in
--    `(SELECT ...)` gekapselt.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Interne sehen Aktivitaeten (scoped)" ON public.aktivitaeten;
CREATE POLICY "Interne sehen Aktivitaeten (scoped)"
  ON public.aktivitaeten
  FOR SELECT
  USING (
    (SELECT public.is_internal_role(auth.uid()))
    AND (
      (SELECT public.hat_breiten_kontaktzugriff(auth.uid()))
      OR public.ist_eigener_kontakt(auth.uid(), aktivitaeten.kunde_id)
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
      OR public.ist_eigener_kontakt(auth.uid(), follow_ups.kunde_id)
    )
  );

-- activity_log: dieselben fuenf Rollen wie hat_breiten_kontaktzugriff standen
-- hier bisher einzeln und liefen ebenfalls je Zeile.
DROP POLICY IF EXISTS "activity_log_select_visible" ON public.activity_log;
CREATE POLICY "activity_log_select_visible"
  ON public.activity_log
  FOR SELECT
  TO authenticated
  USING (
    (SELECT public.hat_breiten_kontaktzugriff(auth.uid()))
    OR activity_log.actor_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.kontakte k
      WHERE k.id = activity_log.kontakt_id
        AND public.is_vp_owner_of_kontakt(auth.uid(), k.zustaendig_id, k.meta)
    )
  );
