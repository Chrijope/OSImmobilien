-- ===========================================================================
-- Performance, Stufe 2b: Rollenpruefung in RLS-Regeln einmal je Abfrage
-- ===========================================================================
--
-- Herkunft: Performance_Bericht_2026-09-15.md, Abschnitt 4 ("RLS: 88 Regeln
-- rufen is_internal_role(auth.uid()) je Zeile statt (select ...) einmal je
-- Abfrage"). Supabase nennt diese Umstellung in "RLS performance" als
-- wirksamste Einzelmassnahme.
--
-- Was hier passiert
--
-- Eine Regel wie `USING (public.is_internal_role(auth.uid()))` wertet
-- Postgres fuer JEDE Zeile aus, die die Abfrage anfasst. Die Funktion ist
-- SECURITY DEFINER und damit fuer den Planer eine Blackbox; bei 5000
-- Kontakten sind das 5000 Nachschlaege in user_roles pro Ladevorgang.
-- Schreibt man stattdessen `USING ((select public.is_internal_role(auth.uid())))`,
-- wird der Ausdruck als InitPlan genau EINMAL pro Abfrage berechnet, weil er
-- von keiner Spalte der Zeile abhaengt.
--
-- Dieselbe Technik hat das Projekt am 27.08. und 30.08.2026 schon fuer die
-- Lese-Regeln von aktivitaeten, follow_ups, activity_log, chat_nachrichten
-- und benachrichtigungen angewandt (20260827220000, 20260827230000,
-- 20260830120000). Diese Migration zieht die uebrigen Regeln der grossen
-- Tabellen nach.
--
-- Die Sichtbarkeits- und Schreibregeln aendern sich NICHT. Jede Regel wird
-- mit demselben Namen, demselben Befehl (SELECT/INSERT/UPDATE/DELETE),
-- derselben Rollenliste (TO) und derselben Logik neu angelegt; nur die
-- Aufrufe, die allein vom angemeldeten Nutzer abhaengen, stehen jetzt in
-- `(select ...)`. Aufrufe, die eine Spalte der Zeile brauchen
-- (is_vp_owner_of_kontakt, is_vp_eigentuemer_of_kontakt,
-- kontakt_visible_to_internal, is_chat_participant, ist_empfehlungsgeber_von),
-- bleiben unveraendert je Zeile.
--
-- Einzige Ausnahme, ausdruecklich markiert (Nr. 23): Die Lese-Regel auf
-- kommunikation wird nach dem Muster von 20260827220000 in
-- `(select hat_breiten_kontaktzugriff) OR ist_eigener_kontakt(...)` zerlegt.
-- Das ist wortwoertlich die Definition von kontakt_visible_to_internal seit
-- 20260827220000, also dieselbe Logik, aber der teure Rollenteil laeuft nur
-- noch einmal.
--
-- Alle Rollenfunktionen sind laut Migrationshistorie bereits STABLE
-- (has_role 20260313125047, is_internal_role 20260403110042, is_admin_role
-- 20260316100512, is_objekt_manager 20260319070020, hat_breiten_kontaktzugriff
-- 20260827220000). Ein ALTER FUNCTION ist daher nicht noetig.
--
-- Jede Regel: DROP POLICY IF EXISTS, dann CREATE POLICY. Mehrfach ausfuehrbar.
--
-- ---------------------------------------------------------------------------
-- Geaenderte Regeln und ihre Herkunft (letzte gueltige Fassung)
-- ---------------------------------------------------------------------------
--
-- kontakte
--   1  Admin und interne Rollen sehen Kontakte        20260608093601 (SELECT)
--   2  Admin und interne Rollen bearbeiten Kontakte   20260608093601 (UPDATE)
--   3  Admin und interne Rollen loeschen Kontakte     20260608093601 (DELETE)
--   4  Interne erstellen Kontakte                     20260517073534 (INSERT)
--   5  Vertriebspartner sehen eigene Kontakte         20260517073534 (SELECT)
--   6  Vertriebspartner bearbeiten eigene Kontakte    20260517073534 (UPDATE)
--   7  Vertriebspartner loeschen eigene Kontakte      20260807150000 (DELETE)
--   8  Tippgeber sieht eigene Empfehlungen            20260610111003 (SELECT)
-- investments
--   9  Interne sehen Investments                      20260316100536 (SELECT)
--  10  Interne bearbeiten Investments                 20260316100536 (UPDATE)
--  11  Interne erstellen Investments                  20260316100536 (INSERT)
--  12  Admins und zustaendige VP loeschen Investments 20260813064020 (DELETE)
-- aktivitaeten
--  13  Interne bearbeiten Aktivitaeten (scoped)       20260517090623 (UPDATE)
--  14  Interne erstellen Aktivitaeten (scoped)        20260728120000 (INSERT)
--  15  Leitung loescht Aktivitaeten                   20260728140000 (DELETE)
-- activity_log
--  16  activity_log_insert_own                        20260728120000 (INSERT)
-- aufgaben
--  17  Interne Rollen erstellen Aufgaben fuer andere  20260622131938 (INSERT)
--  18  Interne Rollen sehen Aufgaben am Kunden        20260727130000 (SELECT)
--  19  Leitung bearbeitet Aufgaben am Kunden          20260831150000 (UPDATE)
-- follow_ups
--  20  Interne bearbeiten FollowUps (scoped)          20260517090623 (UPDATE)
--  21  Interne loeschen FollowUps (scoped)            20260517090623 (DELETE)
--  22  Interne erstellen FollowUps (scoped)           20260728120000 (INSERT)
-- kommunikation
--  23  Interne sehen Kommunikation (scoped)           20260517090623 (SELECT)
--  24  Interne bearbeiten Kommunikation (scoped)      20260517090623 (UPDATE)
--  25  Interne erstellen Kommunikation                20260316100616 (INSERT)
-- chat_nachrichten
--  26  Teilnehmer aktualisieren Lesebestätigung       20260321141014 (UPDATE)
-- bewerbungen
--  27  Interne sehen Bewerbungen                      20260316100616 (SELECT)
--  28  Interne bearbeiten Bewerbungen                 20260316100616 (UPDATE)
-- objekte
--  29  Interne sehen Objekte                          20260316100616 (SELECT)
--  30  Interne bearbeiten Objekte                     20260316100616 (UPDATE)
--  31  Objekt-Manager erstellen Objekte               20260319070020 (INSERT)
--  32  Objekt-Manager loeschen Objekte                20260319070020 (DELETE)
-- wohnungen
--  33  Nur Interne sehen Wohnungen direkt             20260517150506 (SELECT)
--  34  Interne bearbeiten Wohnungen                   20260316192547 (UPDATE)
--  35  Interne erstellen Wohnungen                    20260316192547 (INSERT)
--  36  Objekt-Manager loeschen Wohnungen              20260319070020 (DELETE)
-- finanzierungen
--  37  Interne sehen Finanzierungen                   20260316100536 (SELECT)
--  38  Interne bearbeiten Finanzierungen              20260316100536 (UPDATE)
--  39  Interne erstellen Finanzierungen               20260316100536 (INSERT)
-- benachrichtigungen
--  40  Admins sehen alle Benachrichtigungen           20260707093446 (SELECT)
--  41  Nutzer erstellen eigene Benachrichtigungen     20260419171819 (INSERT)
--  42  Admins loeschen Benachrichtigungen             20260731100000 (DELETE)
--
-- Nicht angefasst, weil ohne Rollenfunktion oder schon umgestellt:
--   kontakte "Kunden sehen eigenen Kontakt", "Kunden erstellen
--   Empfehlungs-Leads"; investments "Kunden sehen eigene Investments";
--   finanzierungen "Kunden sehen eigene Finanzierungen"; aktivitaeten,
--   follow_ups, activity_log, chat_nachrichten, benachrichtigungen
--   (Lese-Regeln vom 27.08./30.08.); chat_nachrichten "Nutzer senden
--   Nachrichten"; aufgaben "Nutzer sehen zugewiesene Aufgaben", "Nutzer
--   erstellen Aufgaben", "Nutzer bearbeiten eigene Aufgaben";
--   benachrichtigungen "Nutzer aktualisieren eigene Benachrichtigungen".
--
-- ---------------------------------------------------------------------------
-- VORHER: aktuelle Regeln sichern (Abfrage kopieren, Ergebnis aufheben)
-- ---------------------------------------------------------------------------
--
--   select tablename, policyname, cmd, roles, qual, with_check
--   from pg_policies
--   where schemaname = 'public'
--     and tablename in ('kontakte','investments','aktivitaeten','activity_log',
--                       'aufgaben','follow_ups','kommunikation',
--                       'chat_nachrichten','bewerbungen','objekte','wohnungen',
--                       'finanzierungen','benachrichtigungen')
--   order by tablename, policyname;
--
-- ===========================================================================


-- ===========================================================================
-- kontakte
-- ===========================================================================

-- 1) 20260608093601
DROP POLICY IF EXISTS "Admin und interne Rollen sehen Kontakte" ON public.kontakte;
CREATE POLICY "Admin und interne Rollen sehen Kontakte"
  ON public.kontakte
  FOR SELECT
  TO authenticated
  USING (
    (select public.is_admin_role(auth.uid()))
    OR (
      (select public.is_internal_role(auth.uid()))
      AND NOT (select public.has_role(auth.uid(), 'vertriebspartner'::app_role))
    )
  );

-- 2) 20260608093601
DROP POLICY IF EXISTS "Admin und interne Rollen bearbeiten Kontakte" ON public.kontakte;
CREATE POLICY "Admin und interne Rollen bearbeiten Kontakte"
  ON public.kontakte
  FOR UPDATE
  TO authenticated
  USING (
    (select public.is_admin_role(auth.uid()))
    OR (
      (select public.is_internal_role(auth.uid()))
      AND NOT (select public.has_role(auth.uid(), 'vertriebspartner'::app_role))
    )
  )
  WITH CHECK (
    (select public.is_admin_role(auth.uid()))
    OR (
      (select public.is_internal_role(auth.uid()))
      AND NOT (select public.has_role(auth.uid(), 'vertriebspartner'::app_role))
    )
  );

-- 3) 20260608093601
DROP POLICY IF EXISTS "Admin und interne Rollen loeschen Kontakte" ON public.kontakte;
CREATE POLICY "Admin und interne Rollen loeschen Kontakte"
  ON public.kontakte
  FOR DELETE
  TO authenticated
  USING (
    (select public.is_admin_role(auth.uid()))
    OR (
      (select public.is_internal_role(auth.uid()))
      AND NOT (select public.has_role(auth.uid(), 'vertriebspartner'::app_role))
    )
  );

-- 4) 20260517073534
DROP POLICY IF EXISTS "Interne erstellen Kontakte" ON public.kontakte;
CREATE POLICY "Interne erstellen Kontakte"
  ON public.kontakte
  FOR INSERT
  TO authenticated
  WITH CHECK ((select public.is_internal_role(auth.uid())));

-- 5) 20260517073534. is_vp_owner_of_kontakt braucht die Zeile, bleibt je Zeile.
DROP POLICY IF EXISTS "Vertriebspartner sehen eigene Kontakte" ON public.kontakte;
CREATE POLICY "Vertriebspartner sehen eigene Kontakte"
  ON public.kontakte
  FOR SELECT
  TO authenticated
  USING (
    (select public.has_role(auth.uid(), 'vertriebspartner'))
    AND public.is_vp_owner_of_kontakt(auth.uid(), zustaendig_id, meta)
  );

-- 6) 20260517073534 (ohne WITH CHECK, wie bisher)
DROP POLICY IF EXISTS "Vertriebspartner bearbeiten eigene Kontakte" ON public.kontakte;
CREATE POLICY "Vertriebspartner bearbeiten eigene Kontakte"
  ON public.kontakte
  FOR UPDATE
  TO authenticated
  USING (
    (select public.has_role(auth.uid(), 'vertriebspartner'))
    AND public.is_vp_owner_of_kontakt(auth.uid(), zustaendig_id, meta)
  );

-- 7) 20260807150000 (Eigentuemer ohne Vertretung darf loeschen)
DROP POLICY IF EXISTS "Vertriebspartner loeschen eigene Kontakte" ON public.kontakte;
CREATE POLICY "Vertriebspartner loeschen eigene Kontakte"
  ON public.kontakte
  FOR DELETE
  TO authenticated
  USING (
    (select public.has_role(auth.uid(), 'vertriebspartner'))
    AND public.is_vp_eigentuemer_of_kontakt(auth.uid(), zustaendig_id, meta)
  );

-- 8) 20260610111003
DROP POLICY IF EXISTS "Tippgeber sieht eigene Empfehlungen" ON public.kontakte;
CREATE POLICY "Tippgeber sieht eigene Empfehlungen"
  ON public.kontakte
  FOR SELECT
  TO authenticated
  USING (
    (select public.has_role(auth.uid(), 'tippgeber'::app_role))
    AND (meta ->> 'tippgeberBenutzerId') = auth.uid()::text
  );


-- ===========================================================================
-- investments
-- ===========================================================================

-- 9) 20260316100536
DROP POLICY IF EXISTS "Interne sehen Investments" ON public.investments;
CREATE POLICY "Interne sehen Investments"
  ON public.investments
  FOR SELECT
  TO authenticated
  USING ((select public.is_internal_role(auth.uid())));

-- 10) 20260316100536
DROP POLICY IF EXISTS "Interne bearbeiten Investments" ON public.investments;
CREATE POLICY "Interne bearbeiten Investments"
  ON public.investments
  FOR UPDATE
  TO authenticated
  USING ((select public.is_internal_role(auth.uid())));

-- 11) 20260316100536
DROP POLICY IF EXISTS "Interne erstellen Investments" ON public.investments;
CREATE POLICY "Interne erstellen Investments"
  ON public.investments
  FOR INSERT
  TO authenticated
  WITH CHECK ((select public.is_internal_role(auth.uid())));

-- 12) 20260813064020
DROP POLICY IF EXISTS "Admins und zustaendige VP loeschen Investments" ON public.investments;
CREATE POLICY "Admins und zustaendige VP loeschen Investments"
  ON public.investments
  FOR DELETE
  TO authenticated
  USING (
    (select public.is_admin_role(auth.uid()))
    OR EXISTS (
      SELECT 1
      FROM public.kontakte k
      WHERE k.id = investments.kunde_id
        AND public.is_vp_owner_of_kontakt(auth.uid(), k.zustaendig_id, k.meta)
    )
  );


-- ===========================================================================
-- aktivitaeten (Lese-Regel schon seit 20260827230000 umgestellt)
-- ===========================================================================

-- 13) 20260517090623 (ohne TO, wie bisher)
DROP POLICY IF EXISTS "Interne bearbeiten Aktivitaeten (scoped)" ON public.aktivitaeten;
CREATE POLICY "Interne bearbeiten Aktivitaeten (scoped)"
  ON public.aktivitaeten
  FOR UPDATE
  USING (
    (select public.is_internal_role(auth.uid()))
    AND public.kontakt_visible_to_internal(auth.uid(), aktivitaeten.kunde_id)
  );

-- 14) 20260728120000
DROP POLICY IF EXISTS "Interne erstellen Aktivitaeten (scoped)" ON public.aktivitaeten;
CREATE POLICY "Interne erstellen Aktivitaeten (scoped)"
  ON public.aktivitaeten
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (select public.is_internal_role(auth.uid()))
    AND public.kontakt_visible_to_internal(auth.uid(), aktivitaeten.kunde_id)
  );

-- 15) 20260728140000
DROP POLICY IF EXISTS "Leitung loescht Aktivitaeten" ON public.aktivitaeten;
CREATE POLICY "Leitung loescht Aktivitaeten"
  ON public.aktivitaeten
  FOR DELETE
  TO authenticated
  USING (
    (
      (select public.is_admin_role(auth.uid()))
      OR (select public.has_role(auth.uid(), 'vertriebsleiter'::app_role))
    )
    AND public.kontakt_visible_to_internal(auth.uid(), aktivitaeten.kunde_id)
  );


-- ===========================================================================
-- activity_log (Lese-Regel schon seit 20260827230000 umgestellt)
-- ===========================================================================

-- 16) 20260728120000
DROP POLICY IF EXISTS "activity_log_insert_own" ON public.activity_log;
CREATE POLICY "activity_log_insert_own"
  ON public.activity_log
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (select public.is_internal_role(auth.uid()))
    AND (
      activity_log.actor_id = auth.uid()
      OR (select public.is_admin_role(auth.uid()))
    )
  );


-- ===========================================================================
-- aufgaben
-- ===========================================================================

-- 17) 20260622131938
DROP POLICY IF EXISTS "Interne Rollen erstellen Aufgaben fuer andere" ON public.aufgaben;
CREATE POLICY "Interne Rollen erstellen Aufgaben fuer andere"
  ON public.aufgaben
  FOR INSERT
  TO authenticated
  WITH CHECK ((select public.is_internal_role(auth.uid())));

-- 18) 20260727130000 (identisch erneut in 20260729153700)
DROP POLICY IF EXISTS "Interne Rollen sehen Aufgaben am Kunden" ON public.aufgaben;
CREATE POLICY "Interne Rollen sehen Aufgaben am Kunden"
  ON public.aufgaben
  FOR SELECT
  TO authenticated
  USING (
    kontakt_id IS NOT NULL
    AND (select public.is_internal_role(auth.uid()))
  );

-- 19) 20260831150000
DROP POLICY IF EXISTS "Leitung bearbeitet Aufgaben am Kunden" ON public.aufgaben;
CREATE POLICY "Leitung bearbeitet Aufgaben am Kunden"
  ON public.aufgaben
  FOR UPDATE
  TO authenticated
  USING (
    kontakt_id IS NOT NULL
    AND (
      (select public.has_role(auth.uid(), 'admin'::public.app_role))
      OR (select public.has_role(auth.uid(), 'inhaber'::public.app_role))
      OR (select public.has_role(auth.uid(), 'vertriebsleiter'::public.app_role))
    )
  );


-- ===========================================================================
-- follow_ups (Lese-Regel schon seit 20260827230000 umgestellt)
-- ===========================================================================

-- 20) 20260517090623 (ohne TO, wie bisher)
DROP POLICY IF EXISTS "Interne bearbeiten FollowUps (scoped)" ON public.follow_ups;
CREATE POLICY "Interne bearbeiten FollowUps (scoped)"
  ON public.follow_ups
  FOR UPDATE
  USING (
    (select public.is_internal_role(auth.uid()))
    AND public.kontakt_visible_to_internal(auth.uid(), follow_ups.kunde_id)
  );

-- 21) 20260517090623 (ohne TO, wie bisher)
DROP POLICY IF EXISTS "Interne loeschen FollowUps (scoped)" ON public.follow_ups;
CREATE POLICY "Interne loeschen FollowUps (scoped)"
  ON public.follow_ups
  FOR DELETE
  USING (
    (select public.is_internal_role(auth.uid()))
    AND public.kontakt_visible_to_internal(auth.uid(), follow_ups.kunde_id)
  );

-- 22) 20260728120000
DROP POLICY IF EXISTS "Interne erstellen FollowUps (scoped)" ON public.follow_ups;
CREATE POLICY "Interne erstellen FollowUps (scoped)"
  ON public.follow_ups
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (select public.is_internal_role(auth.uid()))
    AND public.kontakt_visible_to_internal(auth.uid(), follow_ups.kunde_id)
  );


-- ===========================================================================
-- kommunikation (bis 20000 Zeilen beim Login)
-- ===========================================================================

-- 23) 20260517090623 (ohne TO, wie bisher).
--     Bisher: is_internal_role(auth.uid())
--             AND kontakt_visible_to_internal(auth.uid(), meta ->> 'kunde_id')
--     kontakt_visible_to_internal ist seit 20260827220000 definiert als
--       hat_breiten_kontaktzugriff(u) OR ist_eigener_kontakt(u, kunde_id).
--     Hier steht dieselbe Formel ausgeschrieben, damit der Rollenteil
--     (fuenf has_role-Nachschlaege) einmal pro Abfrage laeuft und nicht
--     einmal pro Zeile. Genau die Umstellung, die 20260827220000 fuer
--     aktivitaeten und follow_ups gemacht hat.
DROP POLICY IF EXISTS "Interne sehen Kommunikation (scoped)" ON public.kommunikation;
CREATE POLICY "Interne sehen Kommunikation (scoped)"
  ON public.kommunikation
  FOR SELECT
  USING (
    (select public.is_internal_role(auth.uid()))
    AND (
      (select public.hat_breiten_kontaktzugriff(auth.uid()))
      OR public.ist_eigener_kontakt(auth.uid(), kommunikation.meta ->> 'kunde_id')
    )
  );

-- 24) 20260517090623 (ohne TO, wie bisher)
DROP POLICY IF EXISTS "Interne bearbeiten Kommunikation (scoped)" ON public.kommunikation;
CREATE POLICY "Interne bearbeiten Kommunikation (scoped)"
  ON public.kommunikation
  FOR UPDATE
  USING (
    (select public.is_internal_role(auth.uid()))
    AND public.kontakt_visible_to_internal(auth.uid(), kommunikation.meta ->> 'kunde_id')
  );

-- 25) 20260316100616
DROP POLICY IF EXISTS "Interne erstellen Kommunikation" ON public.kommunikation;
CREATE POLICY "Interne erstellen Kommunikation"
  ON public.kommunikation
  FOR INSERT
  TO authenticated
  WITH CHECK ((select public.is_internal_role(auth.uid())));


-- ===========================================================================
-- chat_nachrichten (Lese-Regel schon seit 20260830120000 umgestellt)
-- ===========================================================================

-- 26) 20260321141014. is_chat_participant braucht chat_id, bleibt je Zeile.
DROP POLICY IF EXISTS "Teilnehmer aktualisieren Lesebestätigung" ON public.chat_nachrichten;
CREATE POLICY "Teilnehmer aktualisieren Lesebestätigung"
  ON public.chat_nachrichten
  FOR UPDATE
  TO authenticated
  USING (
    public.is_chat_participant(auth.uid(), chat_id)
    OR (select public.is_admin_role(auth.uid()))
  )
  WITH CHECK (
    public.is_chat_participant(auth.uid(), chat_id)
    OR (select public.is_admin_role(auth.uid()))
  );


-- ===========================================================================
-- bewerbungen
-- ===========================================================================

-- 27) 20260316100616
DROP POLICY IF EXISTS "Interne sehen Bewerbungen" ON public.bewerbungen;
CREATE POLICY "Interne sehen Bewerbungen"
  ON public.bewerbungen
  FOR SELECT
  TO authenticated
  USING (
    (select public.is_internal_role(auth.uid()))
    OR auth.uid() = benutzer_id
  );

-- 28) 20260316100616
DROP POLICY IF EXISTS "Interne bearbeiten Bewerbungen" ON public.bewerbungen;
CREATE POLICY "Interne bearbeiten Bewerbungen"
  ON public.bewerbungen
  FOR UPDATE
  TO authenticated
  USING ((select public.is_internal_role(auth.uid())));


-- ===========================================================================
-- objekte
-- ===========================================================================

-- 29) 20260316100616
DROP POLICY IF EXISTS "Interne sehen Objekte" ON public.objekte;
CREATE POLICY "Interne sehen Objekte"
  ON public.objekte
  FOR SELECT
  TO authenticated
  USING ((select public.is_internal_role(auth.uid())));

-- 30) 20260316100616
DROP POLICY IF EXISTS "Interne bearbeiten Objekte" ON public.objekte;
CREATE POLICY "Interne bearbeiten Objekte"
  ON public.objekte
  FOR UPDATE
  TO authenticated
  USING ((select public.is_internal_role(auth.uid())));

-- 31) 20260319070020
DROP POLICY IF EXISTS "Objekt-Manager erstellen Objekte" ON public.objekte;
CREATE POLICY "Objekt-Manager erstellen Objekte"
  ON public.objekte
  FOR INSERT
  TO authenticated
  WITH CHECK ((select public.is_objekt_manager(auth.uid())));

-- 32) 20260319070020
DROP POLICY IF EXISTS "Objekt-Manager loeschen Objekte" ON public.objekte;
CREATE POLICY "Objekt-Manager loeschen Objekte"
  ON public.objekte
  FOR DELETE
  TO authenticated
  USING ((select public.is_objekt_manager(auth.uid())));


-- ===========================================================================
-- wohnungen
-- ===========================================================================

-- 33) 20260517150506
DROP POLICY IF EXISTS "Nur Interne sehen Wohnungen direkt" ON public.wohnungen;
CREATE POLICY "Nur Interne sehen Wohnungen direkt"
  ON public.wohnungen
  FOR SELECT
  TO authenticated
  USING ((select public.is_internal_role(auth.uid())));

-- 34) 20260316192547
DROP POLICY IF EXISTS "Interne bearbeiten Wohnungen" ON public.wohnungen;
CREATE POLICY "Interne bearbeiten Wohnungen"
  ON public.wohnungen
  FOR UPDATE
  TO authenticated
  USING ((select public.is_internal_role(auth.uid())));

-- 35) 20260316192547
DROP POLICY IF EXISTS "Interne erstellen Wohnungen" ON public.wohnungen;
CREATE POLICY "Interne erstellen Wohnungen"
  ON public.wohnungen
  FOR INSERT
  TO authenticated
  WITH CHECK ((select public.is_internal_role(auth.uid())));

-- 36) 20260319070020
DROP POLICY IF EXISTS "Objekt-Manager loeschen Wohnungen" ON public.wohnungen;
CREATE POLICY "Objekt-Manager loeschen Wohnungen"
  ON public.wohnungen
  FOR DELETE
  TO authenticated
  USING ((select public.is_objekt_manager(auth.uid())));


-- ===========================================================================
-- finanzierungen
-- ===========================================================================

-- 37) 20260316100536
DROP POLICY IF EXISTS "Interne sehen Finanzierungen" ON public.finanzierungen;
CREATE POLICY "Interne sehen Finanzierungen"
  ON public.finanzierungen
  FOR SELECT
  TO authenticated
  USING ((select public.is_internal_role(auth.uid())));

-- 38) 20260316100536
DROP POLICY IF EXISTS "Interne bearbeiten Finanzierungen" ON public.finanzierungen;
CREATE POLICY "Interne bearbeiten Finanzierungen"
  ON public.finanzierungen
  FOR UPDATE
  TO authenticated
  USING ((select public.is_internal_role(auth.uid())));

-- 39) 20260316100536
DROP POLICY IF EXISTS "Interne erstellen Finanzierungen" ON public.finanzierungen;
CREATE POLICY "Interne erstellen Finanzierungen"
  ON public.finanzierungen
  FOR INSERT
  TO authenticated
  WITH CHECK ((select public.is_internal_role(auth.uid())));


-- ===========================================================================
-- benachrichtigungen (Lese-Regel "eigene" schon seit 20260830120000 umgestellt)
-- ===========================================================================

-- 40) 20260707093446
DROP POLICY IF EXISTS "Admins sehen alle Benachrichtigungen" ON public.benachrichtigungen;
CREATE POLICY "Admins sehen alle Benachrichtigungen"
  ON public.benachrichtigungen
  FOR SELECT
  TO authenticated
  USING (
    (select public.has_role(auth.uid(), 'admin'))
    OR (select public.has_role(auth.uid(), 'inhaber'))
  );

-- 41) 20260419171819
DROP POLICY IF EXISTS "Nutzer erstellen eigene Benachrichtigungen" ON public.benachrichtigungen;
CREATE POLICY "Nutzer erstellen eigene Benachrichtigungen"
  ON public.benachrichtigungen
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = benutzer_id
    OR (select public.is_internal_role(auth.uid()))
    OR EXISTS (
      SELECT 1
      FROM public.chat_teilnehmer ct1
      JOIN public.chat_teilnehmer ct2 ON ct1.chat_id = ct2.chat_id
      WHERE ct1.benutzer_id = auth.uid()
        AND ct2.benutzer_id = benachrichtigungen.benutzer_id
    )
  );

-- 42) 20260731100000
DROP POLICY IF EXISTS "Admins loeschen Benachrichtigungen" ON public.benachrichtigungen;
CREATE POLICY "Admins loeschen Benachrichtigungen"
  ON public.benachrichtigungen
  FOR DELETE
  TO authenticated
  USING ((select public.is_admin_role(auth.uid())));


-- ===========================================================================
-- NACHHER: Pruefabfragen (aendern nichts)
-- ===========================================================================
--
-- 1) Alle Regeln der 13 Tabellen mit ihrer Bedingung. In `qual` bzw.
--    `with_check` muss bei den 42 Regeln oben jetzt `(SELECT ...)` um die
--    Rollenfunktion stehen. Ergebnis mit der VORHER-Sicherung vergleichen:
--    gleiche Anzahl Zeilen, gleiche Namen, gleiche cmd und roles.
--
--   select tablename, policyname, cmd, roles, qual, with_check
--   from pg_policies
--   where schemaname = 'public'
--     and tablename in ('kontakte','investments','aktivitaeten','activity_log',
--                       'aufgaben','follow_ups','kommunikation',
--                       'chat_nachrichten','bewerbungen','objekte','wohnungen',
--                       'finanzierungen','benachrichtigungen')
--   order by tablename, policyname;
--
-- 2) Welche Regeln rufen eine Rollenfunktion noch ohne (select ...)?
--    Erwartet: keine Zeile fuer die 13 Tabellen.
--
--   select tablename, policyname, cmd
--   from pg_policies
--   where schemaname = 'public'
--     and tablename in ('kontakte','investments','aktivitaeten','activity_log',
--                       'aufgaben','follow_ups','kommunikation',
--                       'chat_nachrichten','bewerbungen','objekte','wohnungen',
--                       'finanzierungen','benachrichtigungen')
--     and (coalesce(qual, '') || ' ' || coalesce(with_check, ''))
--         ~ '(?<!SELECT )(?<!SELECT public\.)(public\.)?(is_internal_role|is_admin_role|has_role|is_objekt_manager|hat_breiten_kontaktzugriff)\('
--   order by tablename, policyname;
--
--    (pg_policies schreibt den Unterselect als `( SELECT is_admin_role(...)
--    AS is_admin_role)`; die Abfrage findet nur Aufrufe, vor denen kein
--    `SELECT ` steht.)
--
-- 3) Sind die Rollenfunktionen STABLE? Erwartet: provolatile = 's' ueberall.
--
--   select proname, provolatile, prosecdef
--   from pg_proc
--   where pronamespace = 'public'::regnamespace
--     and proname in ('is_internal_role','is_admin_role','has_role',
--                     'is_objekt_manager','hat_breiten_kontaktzugriff',
--                     'ist_eigener_kontakt','kontakt_visible_to_internal')
--   order by proname;
