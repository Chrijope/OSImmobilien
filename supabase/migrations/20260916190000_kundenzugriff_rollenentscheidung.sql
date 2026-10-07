-- ===========================================================================
-- Wer darf Kunden sehen? Die Entscheidung vom 16.09.2026
-- ===========================================================================
--
-- HERKUNFT
--
-- Sicherheitsaudit vom 15./16.09.2026, Befund F06. Es ist der groesste Punkt
-- des Audits: Heute sieht jede interne Rolle ausser dem Vertriebspartner
-- saemtliche Kontakte, Kundenprofile und Investments. Das schliesst Rollen
-- ein, die mit Kunden gar nichts zu tun haben, etwa das Objektmanagement,
-- die Hausverwaltung, das Marketing und das Bewerbermanagement.
--
-- GL hat am 16.09.2026 entschieden, wer kuenftig Kunden sehen darf.
-- Diese Migration setzt genau diese Entscheidung um, Wort fuer Wort.
--
-- DIE ENTSCHEIDUNG
--
--   Vollzugriff auf Kontakte, Kundenprofile, Investments, Finanzierungen:
--     admin, inhaber, vertriebsleiter, backoffice, finanzierungspartner,
--     buchhaltung, setterin
--
--   Nur die eigenen zugewiesenen Kunden und deren Investments:
--     vertriebspartner   (unveraendert, die Regel gilt seit 20260517073534)
--
--   Gar kein Zugriff auf Kunden, Kundenprofile und Investments:
--     objektpartner, hausverwaltung, marketing, hr, versicherungsexperte
--
--   Unveraendert wie bisher, also Vollzugriff:
--     individuell (wird einzeln freigeschaltet), testaccount
--
-- WER ZUGRIFF VERLIERT, BITTE LESEN
--
-- Ab dem Lauf dieser Migration sehen diese fuenf Rollen keinen einzigen
-- Kontakt und kein einziges Investment mehr:
--
--     objektpartner
--     hausverwaltung
--     marketing
--     hr
--     versicherungsexperte
--
-- Wer heute mit einem dieser Zugaenge arbeitet, sieht danach leere Listen.
-- Das ist gewollt, aber es faellt sofort auf. Die Seite `/kunden` und die
-- Seite `/pipeline` stehen fuer `versicherungsexperte` weiterhin in der
-- Freigabeliste `public.role_permissions`; sie oeffnen sich also, zeigen aber
-- nichts mehr. Ob dieser Rolle die Seiten genommen werden, ist eine zweite
-- Entscheidung und steht bewusst NICHT in dieser Migration.
--
-- WER ZUGRIFF DAZUBEKOMMT, EBENFALLS BITTE LESEN
--
-- `hat_breiten_kontaktzugriff` (20260827220000) trug bisher eine eigene,
-- kuerzere Liste: admin, inhaber, hausverwaltung, buchhaltung, backoffice,
-- vertriebsleiter. Sie entscheidet ueber Aktivitaeten, Follow-ups,
-- Kommunikation und das Aenderungsprotokoll, also ueber die Vorgeschichte
-- eines Kunden. Damit galten im Haus zwei verschiedene Regeln fuer dieselbe
-- Frage. Genau das soll es nach GL-Wunsch nicht mehr geben, deshalb
-- verweist die Funktion ab hier auf die neue gemeinsame Regel.
--
-- Zwei Folgen, in beide Richtungen:
--
--   `hausverwaltung` verliert die Aktivitaeten, Follow-ups, die Kommunikation
--   und das Aenderungsprotokoll aller Kunden. Das ist der Zweck der Sache:
--   Ohne diesen Schritt waere der Kontakt zwar zu, seine Vorgeschichte aber
--   weiter offen. Eine Regel, die nur die Haupttabelle schliesst, ist keine
--   Regel.
--
--   `finanzierungspartner`, `setterin`, `individuell` und `testaccount`
--   bekommen umgekehrt Zugriff auf die Vorgeschichte der Kunden, die sie
--   ohnehin sehen duerfen. Bisher sahen sie den Kunden, aber keine einzige
--   seiner Aktivitaeten. Das war kein Schutz, sondern ein halber Datensatz.
--   Soll es dabei bleiben, ist das eine eigene Entscheidung; dann bekommt
--   `hat_breiten_kontaktzugriff` wieder eine eigene, engere Liste.
--
--   Eine Ausnahme ist geprueft und ausdruecklich eingebaut, siehe Abschnitt
--   4h: Die Mieterkommunikation der Hausverwaltung liegt in derselben Tabelle
--   `kommunikation` wie die Kundenkommunikation, nur ohne `meta->>kunde_id`.
--   Sie bleibt der Hausverwaltung erhalten, sonst waere `/hv-kommunikation`
--   ab dem Lauf leer.
--
-- WAS AUSDRUECKLICH NICHT ANGEFASST WIRD
--
-- `public.is_internal_role` bleibt unveraendert. Sie zaehlt fuenfzehn Rollen
-- auf und beantwortet eine ganz andere Frage, naemlich "gehoert diese Person
-- zum Haus". Sie steht in weit ueber hundert Regeln und in mehreren
-- Edge Functions, unter anderem fuer Objekte, Wohnungen, Unterlagen, den
-- Kalender und die Reservierung. Wer sie enger macht, um Kunden zu schuetzen,
-- schliesst dem Objektmanagement nebenbei die Objekte. Deshalb steht die
-- Kundenfrage ab jetzt in einer eigenen Funktion.
--
-- DREIWERTIGE LOGIK
--
-- Jede neue Bedingung steht in `COALESCE(..., false)`. `FALSE OR NULL` ist
-- NULL, und eine Sperre auf NULL greift nicht. Dieser Fehler war am
-- 16.09.2026 schon an fuenf Stellen die Ursache, siehe
-- 20260916100000_rpc_sperren_dreiwertige_logik.sql.
--
-- REIHENFOLGE
--
-- Diese Datei laeuft VOR
--   20260916191000_investments_zeilenweise.sql
--   20260916192000_investment_rpcs_zeilenweise.sql
-- Beide bauen auf `darf_alle_kunden_sehen` auf. Die beiden Dateien hiessen
-- bis zum 16.09.2026 20260915200000 und 20260915201000; sie waren vorbereitet,
-- aber nie ausgefuehrt und sind umnummeriert worden, damit sie nach dieser
-- Entscheidung laufen.
--
-- Mehrfach ausfuehrbar: jede Regel erst DROP IF EXISTS, dann CREATE.
--
-- ---------------------------------------------------------------------------
-- SICHERUNG: heutigen Stand vor dem Ausfuehren festhalten
-- ---------------------------------------------------------------------------
--
-- Aendert nichts. Ergebnis wegspeichern, dann laesst sich jede Regel im
-- Wortlaut wiederherstellen:
--
--   select tablename, policyname, cmd, roles, qual, with_check
--     from pg_policies
--    where schemaname = 'public'
--      and tablename in ('kontakte','aufgaben','pipeline','anrufe',
--                        'sa_fill_tokens','empfehlungen','kunden_bewertungen',
--                        'sales_coach_aufnahmen')
--    order by tablename, cmd, policyname;
--
--   select p.proname, pg_get_functiondef(p.oid)
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public'
--      and p.proname in ('hat_breiten_kontaktzugriff', 'is_internal_role');
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1) Die eine Wahrheit
-- ---------------------------------------------------------------------------
--
-- Haengt nur am angemeldeten Nutzer, nie an der Zeile. Deshalb steht sie in
-- den Regeln in `(select ...)` und laeuft einmal je Abfrage statt einmal je
-- Zeile (Muster aus 20260827220000 und 20260915141000).
--
-- Bewusst eine ausgeschriebene Positivliste und keine Abzugsliste von
-- `is_internal_role`: Eine neue Rolle bekommt so erst einmal keinen Zugriff
-- auf Kunden. Wer sie haben soll, traegt sie hier ausdruecklich ein. Der
-- umgekehrte Weg waere still und deshalb gefaehrlich.
--
-- Wer diese Liste aendert, aendert sie fuer Kontakte, Kundenprofile,
-- Investments, Finanzierungen, Aktivitaeten, Follow-ups, Kommunikation,
-- Aufgaben am Kunden, Pipeline, Anrufe, Selbstauskunft-Token, Empfehlungen,
-- Kundenbewertungen und die Gespraechsaufnahmen. Der Test
-- `src/lib/kundenzugriffRollen.test.ts` faellt um, wenn hier eine Rolle
-- dazukommt oder verschwindet.

CREATE OR REPLACE FUNCTION public.darf_alle_kunden_sehen(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = _user_id
        AND ur.role IN (
          'admin',
          'inhaber',
          'vertriebsleiter',
          'backoffice',
          'finanzierungspartner',
          'buchhaltung',
          'setterin',
          'individuell',
          'testaccount'
        )
    )
  ), false)
$$;

COMMENT ON FUNCTION public.darf_alle_kunden_sehen(uuid) IS
  'Darf dieser Nutzer alle Kunden sehen? Entscheidung vom 16.09.2026: admin, '
  'inhaber, vertriebsleiter, backoffice, finanzierungspartner, buchhaltung, '
  'setterin, dazu individuell und testaccount. Der Vertriebspartner sieht nur '
  'seine eigenen Kunden, objektpartner, hausverwaltung, marketing, hr und '
  'versicherungsexperte gar keine. Gilt fuer Kontakte, Kundenprofile, '
  'Investments und Finanzierungen. Nicht verwechseln mit is_internal_role, '
  'die nur sagt, ob jemand zum Haus gehoert.';

REVOKE ALL ON FUNCTION public.darf_alle_kunden_sehen(uuid) FROM public;
REVOKE ALL ON FUNCTION public.darf_alle_kunden_sehen(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.darf_alle_kunden_sehen(uuid) TO authenticated;


-- ---------------------------------------------------------------------------
-- 2) Die zweite, kuerzere Liste faellt weg
-- ---------------------------------------------------------------------------
--
-- `hat_breiten_kontaktzugriff` bleibt als Name bestehen, weil sie in vielen
-- Regeln und in `kontakt_visible_to_internal` steht. Sie traegt ab hier aber
-- keine eigene Rollenliste mehr, sondern verweist auf die Entscheidung oben.
-- Wirkung siehe Kopf der Migration: hausverwaltung verliert, die vier anderen
-- gewinnen.

CREATE OR REPLACE FUNCTION public.hat_breiten_kontaktzugriff(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.darf_alle_kunden_sehen(_user_id), false)
$$;

COMMENT ON FUNCTION public.hat_breiten_kontaktzugriff(uuid) IS
  'Alter Name, seit dem 16.09.2026 nur noch ein Verweis auf '
  'darf_alle_kunden_sehen. Die eigene Rollenliste ist absichtlich entfallen, '
  'damit es fuer Kunden und ihre Vorgeschichte genau eine Regel gibt.';


-- ===========================================================================
-- 3) kontakte
-- ===========================================================================
--
-- Vier Regeln. Die drei breiten Regeln lauteten bis heute
--   is_admin_role
--   OR (is_internal_role AND NOT has_role(vertriebspartner))
-- und die Einfuegeregel schlicht `is_internal_role`. Der Admin-Zweig steckt
-- jetzt in `darf_alle_kunden_sehen` und entfaellt deshalb hier.
--
-- Die vier Vertriebspartner-Regeln und die Tippgeber-Regel aus
-- 20260915141000 bleiben unveraendert und werden hier nicht angefasst.
-- Ebenso "Kunden sehen eigenen Kontakt" und "Kunden erstellen
-- Empfehlungs-Leads".

-- Lesen. Ersetzt 20260608093601 / 20260915141000.
DROP POLICY IF EXISTS "Admin und interne Rollen sehen Kontakte" ON public.kontakte;
CREATE POLICY "Admin und interne Rollen sehen Kontakte"
  ON public.kontakte
  FOR SELECT
  TO authenticated
  USING ((select public.darf_alle_kunden_sehen(auth.uid())));

-- Bearbeiten. Das WITH CHECK ist wie bisher mit dem USING gleichlautend.
DROP POLICY IF EXISTS "Admin und interne Rollen bearbeiten Kontakte" ON public.kontakte;
CREATE POLICY "Admin und interne Rollen bearbeiten Kontakte"
  ON public.kontakte
  FOR UPDATE
  TO authenticated
  USING ((select public.darf_alle_kunden_sehen(auth.uid())))
  WITH CHECK ((select public.darf_alle_kunden_sehen(auth.uid())));

-- Loeschen.
DROP POLICY IF EXISTS "Admin und interne Rollen loeschen Kontakte" ON public.kontakte;
CREATE POLICY "Admin und interne Rollen loeschen Kontakte"
  ON public.kontakte
  FOR DELETE
  TO authenticated
  USING ((select public.darf_alle_kunden_sehen(auth.uid())));

-- Anlegen. Der Vertriebspartner muss hier ausdruecklich stehen: Er legt
-- Kontakte an, hat aber keinen breiten Zugriff. Bisher deckte ihn
-- `is_internal_role` mit ab, und genau dadurch durften auch objektpartner,
-- hausverwaltung, marketing, hr und versicherungsexperte Kontakte anlegen.
DROP POLICY IF EXISTS "Interne erstellen Kontakte" ON public.kontakte;
CREATE POLICY "Interne erstellen Kontakte"
  ON public.kontakte
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (select public.darf_alle_kunden_sehen(auth.uid()))
    OR (select public.has_role(auth.uid(), 'vertriebspartner'::app_role))
  );


-- ===========================================================================
-- 4) Nebentabellen mit Kundendaten
-- ===========================================================================
--
-- Diese Tabellen standen bisher mit einem blanken `is_internal_role` offen.
-- Sie tragen Kundendaten, also gilt fuer sie dieselbe Regel: breiter Zugriff
-- oder der eigene Kunde.
--
-- `ist_eigener_kontakt` (20260827220000) ist die Pruefung je Zeile:
-- Zustaendigkeit, `meta->>erstelltVonId`, `meta->>empfehlungsgeberVpId` oder
-- eine heute laufende Vertretung. Sie nimmt Text entgegen und hat einen
-- Formatwaechter vor dem Cast, `uuid`-Spalten werden deshalb mit `::text`
-- uebergeben.


-- ---------------------------------------------------------------------------
-- 4a) aufgaben: Aufgaben, die an einem Kunden haengen
-- ---------------------------------------------------------------------------
--
-- Bisher: `kontakt_id IS NOT NULL AND is_internal_role`. Jede interne Rolle
-- sah also jede Aufgabe an jedem Kunden, samt Beschreibung.
--
-- Die drei Regeln aus 20260306134740 ("Nutzer sehen zugewiesene Aufgaben",
-- "Nutzer erstellen Aufgaben", "Nutzer bearbeiten eigene Aufgaben") bleiben
-- unberuehrt. Jeder sieht also weiterhin die Aufgaben, die ihm gehoeren oder
-- zugewiesen sind, auch wenn sie an einem fremden Kunden haengen.

DROP POLICY IF EXISTS "Interne Rollen sehen Aufgaben am Kunden" ON public.aufgaben;
CREATE POLICY "Interne Rollen sehen Aufgaben am Kunden"
  ON public.aufgaben
  FOR SELECT
  TO authenticated
  USING (
    aufgaben.kontakt_id IS NOT NULL
    AND (select public.is_internal_role(auth.uid()))
    AND COALESCE(
      (select public.darf_alle_kunden_sehen(auth.uid()))
      OR public.ist_eigener_kontakt(auth.uid(), aufgaben.kontakt_id::text),
      false)
  );


-- ---------------------------------------------------------------------------
-- 4b) pipeline
-- ---------------------------------------------------------------------------
--
-- Bisher: `auth.uid() = benutzer_id OR is_internal_role`. Die Tabelle traegt
-- kontakt_id, wert_euro und Notizen zum Vorgang.
--
-- Der eigene Eintrag bleibt sichtbar, sonst verloere ein Vertriebspartner
-- seine eigene Pipeline, wenn ein Kunde umgehaengt wird.

DROP POLICY IF EXISTS "Nutzer sehen eigene Pipeline-Einträge" ON public.pipeline;
CREATE POLICY "Nutzer sehen eigene Pipeline-Einträge"
  ON public.pipeline
  FOR SELECT
  TO authenticated
  USING (
    COALESCE(
      auth.uid() = pipeline.benutzer_id
      OR (select public.darf_alle_kunden_sehen(auth.uid()))
      OR public.ist_eigener_kontakt(auth.uid(), pipeline.kontakt_id::text),
      false)
  );


-- ---------------------------------------------------------------------------
-- 4c) anrufe
-- ---------------------------------------------------------------------------
--
-- Bisher: `auth.uid() = benutzer_id OR is_internal_role`. Die Tabelle traegt
-- Telefonnummer, Ergebnis und Notizen zum Gespraech.
--
-- `kontakt_id` ist hier ausdruecklich NULL-bar (Anruf ohne Kontaktzuordnung).
-- Eine solche Zeile sieht nur ihr Urheber und der breite Zugriff.

DROP POLICY IF EXISTS "Nutzer sehen eigene Anrufe" ON public.anrufe;
CREATE POLICY "Nutzer sehen eigene Anrufe"
  ON public.anrufe
  FOR SELECT
  TO authenticated
  USING (
    COALESCE(
      auth.uid() = anrufe.benutzer_id
      OR (select public.darf_alle_kunden_sehen(auth.uid()))
      OR public.ist_eigener_kontakt(auth.uid(), anrufe.kontakt_id::text),
      false)
  );


-- ---------------------------------------------------------------------------
-- 4d) sa_fill_tokens: die Ausfuelllinks der Selbstauskunft
-- ---------------------------------------------------------------------------
--
-- Bisher: `is_internal_role` fuer Lesen, Anlegen und Aendern. Ein Token ist
-- der Schluessel zum Selbstauskunftsformular eines Kunden; wer es liest, kann
-- das Formular oeffnen. `kontakt_id` ist hier TEXT, ein Cast entfaellt.
--
-- Die oeffentliche Regel "Public token access" ist am 17.05.2026 entfallen
-- (20260517144245), der Weg des Kunden laeuft seither ueber eine Funktion.

DROP POLICY IF EXISTS "Internal users can read tokens" ON public.sa_fill_tokens;
CREATE POLICY "Internal users can read tokens"
  ON public.sa_fill_tokens
  FOR SELECT
  TO authenticated
  USING (
    (select public.is_internal_role(auth.uid()))
    AND COALESCE(
      (select public.darf_alle_kunden_sehen(auth.uid()))
      OR public.ist_eigener_kontakt(auth.uid(), sa_fill_tokens.kontakt_id),
      false)
  );

DROP POLICY IF EXISTS "Internal users can create tokens" ON public.sa_fill_tokens;
CREATE POLICY "Internal users can create tokens"
  ON public.sa_fill_tokens
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (select public.is_internal_role(auth.uid()))
    AND COALESCE(
      (select public.darf_alle_kunden_sehen(auth.uid()))
      OR public.ist_eigener_kontakt(auth.uid(), sa_fill_tokens.kontakt_id),
      false)
  );

DROP POLICY IF EXISTS "Internal users can update tokens" ON public.sa_fill_tokens;
CREATE POLICY "Internal users can update tokens"
  ON public.sa_fill_tokens
  FOR UPDATE
  TO authenticated
  USING (
    (select public.is_internal_role(auth.uid()))
    AND COALESCE(
      (select public.darf_alle_kunden_sehen(auth.uid()))
      OR public.ist_eigener_kontakt(auth.uid(), sa_fill_tokens.kontakt_id),
      false)
  );


-- ---------------------------------------------------------------------------
-- 4e) empfehlungen
-- ---------------------------------------------------------------------------
--
-- Bisher: `is_internal_role` fuer Lesen, Aendern, Anlegen und Loeschen. Die
-- Tabelle traegt Name, E-Mail und Telefonnummer der empfohlenen Person, also
-- personenbezogene Daten eines kuenftigen Kunden.
--
-- BEWUSST OHNE ZEILENPRUEFUNG, bitte lesen. Hier werden nur die fuenf Rollen
-- ohne Kundenzugriff ausgesperrt. Der Vertriebspartner sieht weiterhin alle
-- Empfehlungen, nicht nur die seiner eigenen Kunden. Grund: Eine Empfehlung
-- entsteht, BEVOR es den geworbenen Kontakt gibt. `kontakt_id` wird erst
-- spaeter nachgetragen (20260818160000), und `benutzer_id` schreibt
-- `src/lib/empfehlungenStore.ts` ueberhaupt nicht. Eine Zeilenpruefung liesse
-- die Seite /empfehlungen fuer den Vertrieb je nach Anlagepfad halb leer
-- aussehen, und zwar still. Ob der Vertriebspartner hier eingegrenzt wird,
-- ist eine eigene Entscheidung und braucht zuerst einen sauberen
-- Kontaktbezug an jeder Zeile.
--
-- Anlegen bleibt bei `is_internal_role`, aus demselben Grund.
--
-- "Kunden sehen eigene Empfehlungen" und "Kunden erstellen eigene
-- Empfehlungen" (20260517090623) bleiben unveraendert.

DROP POLICY IF EXISTS "Interne sehen Empfehlungen" ON public.empfehlungen;
CREATE POLICY "Interne sehen Empfehlungen"
  ON public.empfehlungen
  FOR SELECT
  TO authenticated
  USING (
    (select public.is_internal_role(auth.uid()))
    AND COALESCE(
      (select public.darf_alle_kunden_sehen(auth.uid()))
      OR (select public.has_role(auth.uid(), 'vertriebspartner'::app_role)),
      false)
  );

DROP POLICY IF EXISTS "Interne bearbeiten Empfehlungen" ON public.empfehlungen;
CREATE POLICY "Interne bearbeiten Empfehlungen"
  ON public.empfehlungen
  FOR UPDATE
  TO authenticated
  USING (
    (select public.is_internal_role(auth.uid()))
    AND COALESCE(
      (select public.darf_alle_kunden_sehen(auth.uid()))
      OR (select public.has_role(auth.uid(), 'vertriebspartner'::app_role)),
      false)
  );

DROP POLICY IF EXISTS "Interne loeschen Empfehlungen" ON public.empfehlungen;
CREATE POLICY "Interne loeschen Empfehlungen"
  ON public.empfehlungen
  FOR DELETE
  TO authenticated
  USING (
    (select public.is_internal_role(auth.uid()))
    AND COALESCE(
      (select public.darf_alle_kunden_sehen(auth.uid()))
      OR (select public.has_role(auth.uid(), 'vertriebspartner'::app_role)),
      false)
  );


-- ---------------------------------------------------------------------------
-- 4f) kunden_bewertungen
-- ---------------------------------------------------------------------------
--
-- Bisher: `is_internal_role`. Die Tabelle traegt die Rueckmeldung eines
-- Kunden zu seinem Vorgang, mit `kunde_id` auf `kontakte`.
--
-- "Kunden sehen eigene Bewertungen" (20260830120000) bleibt unveraendert.

DROP POLICY IF EXISTS "Interne sehen alle Bewertungen" ON public.kunden_bewertungen;
CREATE POLICY "Interne sehen alle Bewertungen"
  ON public.kunden_bewertungen
  FOR SELECT
  TO authenticated
  USING (
    (select public.is_internal_role(auth.uid()))
    AND COALESCE(
      (select public.darf_alle_kunden_sehen(auth.uid()))
      OR public.ist_eigener_kontakt(auth.uid(), kunden_bewertungen.kunde_id::text),
      false)
  );


-- ---------------------------------------------------------------------------
-- 4g) sales_coach_aufnahmen
-- ---------------------------------------------------------------------------
--
-- Bisher: `user_id = auth.uid() OR is_internal_role`. Die Tabelle traegt
-- Aufnahmen und Mitschriften echter Kundengespraeche, mit `kontakt_id`.
--
-- Die eigene Aufnahme bleibt sichtbar, auch ohne Kontaktbezug: Sie ist das
-- eigene Trainingsmaterial.

/*
 * Nur anlegen, wenn es die Tabelle gibt.
 *
 * Am 16.09.2026 beim Ausfuehren aufgefallen: `sales_coach_aufnahmen` wird
 * zwar von der Migration 20260531132905 angelegt, die ist in der laufenden
 * Datenbank aber nie gelaufen. Ohne diese Pruefung bricht der ganze Block an
 * dieser Stelle ab, und alles davor ist je nach Editor zurueckgerollt.
 *
 * Dasselbe Muster wie bei `bewerber_mail_tracking` in 20260915180000. Eine
 * Migration, die Regeln auf fremde Tabellen setzt, darf nicht voraussetzen,
 * dass jede davon schon da ist.
 */
DO $sca$
BEGIN
  IF to_regclass('public.sales_coach_aufnahmen') IS NULL THEN
    RAISE NOTICE 'sales_coach_aufnahmen fehlt (Migration 20260531132905 nie gelaufen), Regel uebersprungen';
    RETURN;
  END IF;

  DROP POLICY IF EXISTS "sca_select_team" ON public.sales_coach_aufnahmen;

  EXECUTE $regel$
    CREATE POLICY "sca_select_team"
      ON public.sales_coach_aufnahmen
      FOR SELECT
      TO authenticated
      USING (
        COALESCE(
          sales_coach_aufnahmen.user_id = auth.uid()
          OR (select public.darf_alle_kunden_sehen(auth.uid()))
          OR public.ist_eigener_kontakt(auth.uid(), sales_coach_aufnahmen.kontakt_id::text),
          false)
      )
  $regel$;
END
$sca$;


-- ---------------------------------------------------------------------------
-- 4h) kommunikation: die Hausverwaltung behaelt ihre Mieterkommunikation
-- ---------------------------------------------------------------------------
--
-- Wichtig, sonst geht eine Seite kaputt. Die Tabelle `kommunikation` traegt
-- ZWEI Dinge in einem Topf:
--
--   Kundenkommunikation  mit `meta->>kunde_id`, gehoert zum Kundenprofil
--   Mieterkommunikation  mit `meta->>mieterId` und OHNE `kunde_id`,
--                        geschrieben von `src/lib/kommunikationStore.ts` und
--                        angezeigt auf `/hv-kommunikation`
--
-- Die bisherige Regel liess Zeilen ohne `kunde_id` nur fuer
-- `hat_breiten_kontaktzugriff` durch, und dort stand `hausverwaltung` drin.
-- Weil diese Funktion oben auf die neue Entscheidung umgestellt wurde, saehe
-- die Hausverwaltung ihre eigene Mieterkommunikation nicht mehr: Die Seite
-- `/hv-kommunikation` waere leer, obwohl Schreiben weiter ginge.
--
-- Deshalb hier ein ausdruecklicher Zweig: Zeilen OHNE Kundenbezug bleiben
-- fuer die Hausverwaltung sichtbar. Zeilen MIT Kundenbezug folgen der neuen
-- Regel, die Hausverwaltung sieht sie also nicht mehr. Genau so war die
-- Entscheidung gemeint.

DROP POLICY IF EXISTS "Interne sehen Kommunikation (scoped)" ON public.kommunikation;
CREATE POLICY "Interne sehen Kommunikation (scoped)"
  ON public.kommunikation
  FOR SELECT
  USING (
    (select public.is_internal_role(auth.uid()))
    AND COALESCE(
      (select public.darf_alle_kunden_sehen(auth.uid()))
      OR public.ist_eigener_kontakt(auth.uid(), kommunikation.meta ->> 'kunde_id')
      OR (
        (kommunikation.meta ->> 'kunde_id') IS NULL
        AND (select public.has_role(auth.uid(), 'hausverwaltung'::app_role))
      ),
      false)
  );

DROP POLICY IF EXISTS "Interne bearbeiten Kommunikation (scoped)" ON public.kommunikation;
CREATE POLICY "Interne bearbeiten Kommunikation (scoped)"
  ON public.kommunikation
  FOR UPDATE
  USING (
    (select public.is_internal_role(auth.uid()))
    AND COALESCE(
      (select public.darf_alle_kunden_sehen(auth.uid()))
      OR public.ist_eigener_kontakt(auth.uid(), kommunikation.meta ->> 'kunde_id')
      OR (
        (kommunikation.meta ->> 'kunde_id') IS NULL
        AND (select public.has_role(auth.uid(), 'hausverwaltung'::app_role))
      ),
      false)
  );


-- ---------------------------------------------------------------------------
-- 5) Indizes
-- ---------------------------------------------------------------------------
--
-- Die zeilenweise Pruefung schlaegt den Kontakt ueber `kontakte(id)` nach,
-- also ueber den Primaerschluessel. Ein neuer Index ist dafuer nicht noetig.
--
-- Geprueft: `anrufe`, `pipeline`, `empfehlungen`, `kunden_bewertungen` und
-- `sales_coach_aufnahmen` haben ihren Index auf dem Kontakt bereits
-- (idx_anrufe_kontakt und idx_pipeline_kontakt aus 20260306134740,
-- idx_empfehlungen_kontakt_id aus 20260818160000, idx_sca_kontakt_id aus
-- 20260531132905). Nur `aufgaben` hat keinen, der wird hier nachgezogen.

CREATE INDEX IF NOT EXISTS idx_aufgaben_kontakt_id
  ON public.aufgaben (kontakt_id);


-- ===========================================================================
-- PRUEFLAUF NACH DEM AUSFUEHREN (aendert nichts)
-- ===========================================================================
--
-- 1) Die Rollenmatrix: Hat jede Rolle den Zugriff, den sie haben soll?
--    Die Abfrage nimmt je Rolle einen beliebigen Nutzer, der sie traegt, und
--    fragt die neue Funktion. Rollen ohne Nutzer stehen mit `null` da.
--
--   select r.rolle,
--          u.user_id,
--          public.darf_alle_kunden_sehen(u.user_id) as sieht_alle_kunden,
--          case r.rolle
--            when 'vertriebspartner' then 'nur eigene Kunden'
--            when 'objektpartner'    then 'kein Zugriff'
--            when 'hausverwaltung'   then 'kein Zugriff'
--            when 'marketing'        then 'kein Zugriff'
--            when 'hr'               then 'kein Zugriff'
--            when 'versicherungsexperte' then 'kein Zugriff'
--            else 'Vollzugriff'
--          end as erwartet
--     from (select unnest(enum_range(null::public.app_role)) as rolle) r
--     left join lateral (
--       select ur.user_id
--         from public.user_roles ur
--        where ur.role = r.rolle
--        limit 1
--     ) u on true
--    order by r.rolle;
--
--    Erwartet wird: `sieht_alle_kunden` = true genau fuer admin, inhaber,
--    vertriebsleiter, backoffice, finanzierungspartner, buchhaltung,
--    setterin, individuell und testaccount. Fuer alle anderen false.
--    Achtung bei Personen mit mehreren Rollen: Wer neben `hausverwaltung`
--    auch `admin` traegt, steht zu Recht auf true.
--
-- 2) Die scharfe Probe, als dieser Nutzer und mit Zeilensicherheit. Aendert
--    nichts, das ROLLBACK nimmt alles zurueck.
--
--   begin;
--     set local role authenticated;
--     set local request.jwt.claims = '{"sub":"<UUID>","role":"authenticated"}';
--     select count(*) as kontakte     from public.kontakte;
--     select count(*) as aufgaben     from public.aufgaben where kontakt_id is not null;
--     select count(*) as pipeline     from public.pipeline;
--     select count(*) as anrufe       from public.anrufe;
--     select count(*) as empfehlungen from public.empfehlungen;
--   rollback;
--
--    Erwartet fuer objektpartner, hausverwaltung, marketing, hr und
--    versicherungsexperte: ueberall 0.
--    Erwartet fuer einen Vertriebspartner: deutlich weniger als der Bestand.
--    Erwartet fuer backoffice, buchhaltung, vertriebsleiter,
--    finanzierungspartner und setterin: der volle Bestand.
--
-- 3) Gegenprobe, dass is_internal_role unveraendert geblieben ist. Es muessen
--    weiterhin fuenfzehn Rollen dastehen.
--
--   select pg_get_functiondef(p.oid)
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.proname = 'is_internal_role';
-- ===========================================================================
