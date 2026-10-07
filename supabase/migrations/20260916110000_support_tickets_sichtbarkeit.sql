-- ===========================================================================
-- Support-Tickets: fremde Tickets nur noch fuer Admin, Inhaber, Backoffice
-- und die Vertriebsleitung, und die nur fuer ihr eigenes Team
-- ===========================================================================
--
-- WARUM
--
-- Ein Sicherheitsbefund vom 16.09.2026. Die Leseregel auf
-- `public.support_tickets` war zu weit. Ihre zeitlich letzte Fassung stammt
-- aus `20260316100616_b6908103-415c-46f5-8e37-a2dbdb161d5c.sql` (Zeile 83):
--
--   CREATE POLICY "Sehen SupportTickets" ON public.support_tickets
--     FOR SELECT TO authenticated
--     USING (public.is_internal_role(auth.uid()) OR auth.uid() = benutzer_id);
--
-- `public.is_internal_role` ist in ihrer letzten Fassung
-- (`20260403110042_d1a9de8e-7630-4e77-b0c3-fa2c6143f6b7.sql`) sehr breit. Sie
-- zaehlt sechzehn Rollen auf, darunter `vertriebspartner`, `setterin`,
-- `objektpartner`, `finanzierungspartner`, `testaccount` und `individuell`.
-- Jeder Vertriebspartner konnte damit die Tickets aller Kolleginnen und
-- Kollegen lesen.
--
-- WAS WAR DER FEHLER
--
-- Nicht die Regel allein, sondern was in einem Ticket steht. In
-- `support_tickets.meta` legt die Fehlermeldung aus dem Warndreieck ihren
-- technischen Anhang ab: die besuchte Adresse samt allem, was in der
-- Adresszeile steht, die Konsolenmeldungen und einen Bildschirmabzug. In
-- einer echten Meldung vom 16.09.2026 standen in der Adresszeile Name,
-- Mailadresse, Telefonnummer, Anschrift, Geburtsdatum, Objekt und Kaufpreis
-- eines Kunden. Diese Angaben waren fuer jeden Vertriebspartner lesbar, auch
-- ohne die Helpdesk-Seite: die Zeilen liegen im Zwischenspeicher
-- (`src/lib/dataCache.ts`), und `src/pages/SupportKontaktieren.tsx` hat sie
-- zusaetzlich nach Rolle statt nach Absender gefiltert.
--
-- WAS SICH AENDERT
--
-- Fremde Tickets sehen ab jetzt nur noch:
--   * Administrator und Inhaber, zusammengefasst in `public.is_admin_role`
--   * Backoffice
--   * Vertriebsleitung, aber ausschliesslich die Tickets ihrer eigenen
--     Partner, nicht alle
--
-- Sein eigenes Ticket sieht jeder weiterhin, unveraendert.
--
-- Wer zum Team einer Vertriebsleitung gehoert, beantwortet
-- `public.team_mitglieder(uuid)` aus
-- `20260807160000_team_zuordnung.sql`. Das ist im Projekt die einzige
-- Wahrheit fuer Team-Abfragen; sie speist sich aus
-- `user_settings.teamleader_id`, `user_settings.geworben_von_user_id` und der
-- Bewerberzeile. Dieselbe Funktion benutzt seit dem 18.08.2026 schon die
-- Leseregel auf `user_settings`
-- (`20260818142000_teamleiter_lesen_team_user_settings.sql`).
--
-- WER HAT ENTSCHIEDEN
--
-- Christian, am 16.09.2026, nach dem Befund. Die drei berechtigten Gruppen
-- und die Einschraenkung der Vertriebsleitung auf das eigene Team sind seine
-- Vorgabe.
--
-- AUFGERAEUMT WIRD AUSSERDEM
--
-- 1. `"Nutzer sehen eigene Tickets"` aus
--    `20260314101936_...:540` besteht bis heute, sie wurde nie entfernt.
--    Regeln werden in Postgres mit ODER verknuepft, jede zusaetzliche Regel
--    kann also nur mehr zeigen. Diese hier zeigt genau das, was die neue
--    Regel ohnehin erlaubt (das eigene Ticket), sie unterlaeuft die
--    Einschraenkung also nicht. Sie faellt trotzdem weg, damit die
--    Sichtbarkeit an genau einer Stelle steht und der naechste Leser nicht
--    zwei Regeln zusammenrechnen muss.
--
-- 2. Dieselbe Bereinigung fuer die Schreibregel:
--    `"Nutzer bearbeiten eigene Tickets"` aus `20260314101936_...:542`.
--
-- DIE SCHREIBREGEL WIRD MITKORRIGIERT
--
-- `"Bearbeiten SupportTickets"` (`20260316100616_...:84`) trug dasselbe
-- Muster: `is_internal_role(auth.uid()) OR auth.uid() = benutzer_id`. Ein
-- Vertriebspartner konnte damit jedes fremde Ticket aendern, also Status und
-- Prioritaet setzen und ueber `meta.nachrichten` eine Antwort in einen
-- fremden Vorgang schreiben. Das gehoert mit korrigiert, sonst bliebe die
-- Lese-Einschraenkung halb.
--
-- Bewusst enger als die Leseregel: Aendern duerfen nur Administrator,
-- Inhaber, Backoffice und der Absender selbst. Die Vertriebsleitung LIEST
-- die Tickets ihrer Partner, sie bearbeitet sie nicht. Bearbeiten heisst hier
-- antworten und schliessen, und das ist die Arbeit des Supports, nicht die
-- der Vertriebsleitung. Entschieden wurde nur die Sichtbarkeit; ein
-- Schreibrecht daraus abzuleiten waere mehr, als dasteht. Im Zweifel weniger.
--
-- Die Regel bekommt zusaetzlich ein ausgeschriebenes WITH CHECK mit demselben
-- Wortlaut. Fachlich aendert das nichts, denn ohne WITH CHECK verwendet
-- Postgres den USING-Ausdruck. Ausgeschrieben steht aber da, dass niemand ein
-- Ticket beim Aendern auf eine fremde `benutzer_id` umschreiben kann.
--
-- DIE LOESCHREGEL BLEIBT, WIE SIE IST
--
-- `"Loeschen SupportTickets"` aus
-- `20260602064600_39cace9e-f7aa-4eab-a8ad-d91a6e74cb26.sql` lautet
-- `is_admin_role(auth.uid()) OR benutzer_id = auth.uid()`. Sie ist bereits
-- eng: nur Administrator, Inhaber und der Absender selbst. Sie wird hier
-- nicht angefasst.
--
-- ACHTUNG, DREIWERTIGE LOGIK
--
-- `support_tickets.benutzer_id` ist nullbar (`20260314101936_...:537`). Bei
-- einem Ticket ohne Absender ergibt `benutzer_id = auth.uid()` nicht falsch,
-- sondern unbekannt, und dasselbe gilt fuer `benutzer_id IN (...)`. In einer
-- ODER-Kette faerbt ein unbekannt das Ergebnis ein, sobald kein Glied wahr
-- ist. Jedes Glied steht deshalb einzeln in `COALESCE(..., false)`. Dieselbe
-- Ursache hat am 16.09.2026 an drei Stellen die Sperre ausgehebelt, siehe
-- `20260916100000_rpc_sperren_dreiwertige_logik.sql`.
--
-- Bei einer Leseregel wirkt das umgekehrt wie bei einer RAISE-Sperre: Ein
-- unbekannt zeigt die Zeile NICHT, eine Luecke entsteht dadurch nicht. Das
-- COALESCE steht hier also fuer Klarheit und fuer den Fall, dass jemand die
-- Regel spaeter negiert oder in eine groessere Bedingung einbaut.
--
-- Die Rollenpruefungen stehen in `(SELECT ...)`. Sie haengen von keiner
-- Spalte der Zeile ab und werden dadurch einmal je Abfrage statt einmal je
-- Zeile berechnet. Dasselbe Muster wie in
-- `20260915141000_rls_rollenpruefung_je_abfrage.sql`.
--
-- WENN DIE TEAM-ZUORDNUNG FEHLT
--
-- Steht `public.team_mitglieder(uuid)` in der Datenbank nicht zur Verfuegung,
-- wird die Leseregel OHNE den Teil fuer die Vertriebsleitung angelegt, also
-- nur fuer Administrator, Inhaber, Backoffice und den Absender selbst. Die
-- Migration bricht bewusst nicht ab: Die Luecke muss auf jeden Fall zu, und
-- weniger zu zeigen ist der sichere Ausgang. Ein Hinweis erscheint im
-- Protokoll.
--
-- Wiederholbar: jede Regel wird zuerst mit DROP POLICY IF EXISTS entfernt und
-- dann neu angelegt. Ein zweiter Lauf aendert nichts.
--
-- ---------------------------------------------------------------------------
-- SICHERUNG: heutigen Wortlaut vorher festhalten
-- ---------------------------------------------------------------------------
--
--   select policyname, cmd, qual, with_check
--     from pg_policies
--    where schemaname = 'public' and tablename = 'support_tickets';
-- ===========================================================================


-- ── 1. Lesen ───────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Sehen SupportTickets" ON public.support_tickets;
DROP POLICY IF EXISTS "Nutzer sehen eigene Tickets" ON public.support_tickets;
DROP POLICY IF EXISTS "Alle sehen SupportTickets" ON public.support_tickets;

DO $ausfuehren$
BEGIN
  IF to_regprocedure('public.team_mitglieder(uuid)') IS NULL THEN
    RAISE WARNING
      'public.team_mitglieder(uuid) fehlt (aus 20260807160000_team_zuordnung.sql). '
      'Die Leseregel wird OHNE den Teil fuer die Vertriebsleitung angelegt. '
      'Nach dem Nachziehen jener Migration diese Datei erneut ausfuehren.';

    EXECUTE $regel$
      CREATE POLICY "Sehen SupportTickets"
      ON public.support_tickets
      FOR SELECT
      TO authenticated
      USING (
        COALESCE(benutzer_id = auth.uid(), false)
        OR COALESCE((SELECT public.is_admin_role(auth.uid())), false)
        OR COALESCE((SELECT public.has_role(auth.uid(), 'backoffice'::public.app_role)), false)
      )
    $regel$;
  ELSE
    EXECUTE $regel$
      CREATE POLICY "Sehen SupportTickets"
      ON public.support_tickets
      FOR SELECT
      TO authenticated
      USING (
        -- Das eigene Ticket sieht jeder.
        COALESCE(benutzer_id = auth.uid(), false)

        -- Administrator und Inhaber sehen alle Tickets.
        OR COALESCE((SELECT public.is_admin_role(auth.uid())), false)

        -- Das Backoffice bearbeitet den Support und sieht deshalb alle.
        OR COALESCE((SELECT public.has_role(auth.uid(), 'backoffice'::public.app_role)), false)

        -- Die Vertriebsleitung sieht ausschliesslich die Tickets der eigenen
        -- Partner. Beide Haelften einzeln NULL-sicher gefasst.
        OR (
          COALESCE((SELECT public.has_role(auth.uid(), 'vertriebsleiter'::public.app_role)), false)
          AND COALESCE(
                benutzer_id IN (
                  SELECT m.mitglied_id FROM public.team_mitglieder(auth.uid()) m
                ),
                false)
        )
      )
    $regel$;
  END IF;
END
$ausfuehren$;


-- ── 2. Bearbeiten ──────────────────────────────────────────────────────────
--
-- Enger als das Lesen: ohne die Vertriebsleitung. Begruendung im Kopf.

DROP POLICY IF EXISTS "Bearbeiten SupportTickets" ON public.support_tickets;
DROP POLICY IF EXISTS "Nutzer bearbeiten eigene Tickets" ON public.support_tickets;
DROP POLICY IF EXISTS "Auth bearbeiten SupportTickets" ON public.support_tickets;

CREATE POLICY "Bearbeiten SupportTickets"
ON public.support_tickets
FOR UPDATE
TO authenticated
USING (
  COALESCE(benutzer_id = auth.uid(), false)
  OR COALESCE((SELECT public.is_admin_role(auth.uid())), false)
  OR COALESCE((SELECT public.has_role(auth.uid(), 'backoffice'::public.app_role)), false)
)
WITH CHECK (
  COALESCE(benutzer_id = auth.uid(), false)
  OR COALESCE((SELECT public.is_admin_role(auth.uid())), false)
  OR COALESCE((SELECT public.has_role(auth.uid(), 'backoffice'::public.app_role)), false)
);


-- ── 3. Anlegen und Loeschen bleiben unveraendert ───────────────────────────
--
-- `"Erstellen SupportTickets"` (20260316100616) verlangt
-- `auth.uid() = benutzer_id`, `"Loeschen SupportTickets"` (20260602064600)
-- erlaubt Administrator, Inhaber und den Absender. Beide sind bereits eng
-- genug und werden hier absichtlich nicht angefasst.


COMMENT ON TABLE public.support_tickets IS
  'Support- und Fehlermeldungen. In meta steht der technische Anhang der '
  'Fehlermeldung (Adresse, Konsolenmeldungen, Bildschirmabzug) und damit '
  'moeglicherweise Kundendaten. Fremde Tickets sehen daher nur Administrator, '
  'Inhaber, Backoffice und die Vertriebsleitung fuer ihr eigenes Team; '
  'geaendert am 16.09.2026, siehe Migration 20260916110000_support_tickets_sichtbarkeit.';


-- ===========================================================================
-- PRUEFLAUF NACH DEM AUSFUEHREN (aendert nichts)
-- ===========================================================================
--
-- 1) Welche Regeln liegen jetzt auf der Tabelle? Erwartet werden genau vier:
--    Sehen, Bearbeiten, Erstellen, Loeschen. Die beiden alten
--    "Nutzer ..."-Regeln duerfen nicht mehr auftauchen.
--
--   select policyname, cmd
--     from pg_policies
--    where schemaname = 'public' and tablename = 'support_tickets'
--    order by policyname;
--
-- 2) Steht in der Leseregel kein is_internal_role mehr? Erwartet wird 0.
--
--   select count(*)
--     from pg_policies
--    where schemaname = 'public'
--      and tablename = 'support_tickets'
--      and cmd = 'SELECT'
--      and qual like '%is_internal_role%';
--
-- 3) Die Probe aufs Exempel. Als Vertriebspartner ausgeben und zaehlen.
--    Erwartet wird ausschliesslich die Zahl der EIGENEN Tickets.
--
--   begin;
--     set local role authenticated;
--     set local request.jwt.claims = '{"sub":"<UUID eines Vertriebspartners>","role":"authenticated"}';
--     select count(*) as sichtbar from public.support_tickets;
--     select count(*) as eigene
--       from public.support_tickets
--      where benutzer_id = '<dieselbe UUID>'::uuid;
--   rollback;
--
-- 4) Gegenprobe Vertriebsleitung: sichtbar sein duerfen die eigenen plus die
--    Tickets der eigenen Teampartner, sonst nichts.
--
--   begin;
--     set local role authenticated;
--     set local request.jwt.claims = '{"sub":"<UUID einer Vertriebsleitung>","role":"authenticated"}';
--     select count(*) as sichtbar from public.support_tickets;
--   rollback;
--
--   -- zum Vergleich, ohne Rollenwechsel:
--   select count(*) as erwartet
--     from public.support_tickets t
--    where t.benutzer_id = '<dieselbe UUID>'::uuid
--       or t.benutzer_id in (select m.mitglied_id
--                              from public.team_mitglieder('<dieselbe UUID>'::uuid) m);
--
-- 5) Gegenprobe Backoffice: die Zahl muss der Gesamtzahl entsprechen.
-- ===========================================================================
