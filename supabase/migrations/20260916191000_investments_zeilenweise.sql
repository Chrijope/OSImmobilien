-- ===========================================================================
-- Investments und Finanzierungen zeilenweise eingrenzen
-- ===========================================================================
--
-- VORGABE (Christian, 15.09.2026)
--
--   "Ein Vertriebspartner darf auch ueber die Konsole nur seine eigenen
--    Investments abfragen koennen, also die Investments der ihm zugeordneten
--    Kunden und nicht darueber hinaus."
--
-- AUSGANGSLAGE
--
-- Die Lese-Regel auf `investments` lautet bisher nur
--   USING ((select public.is_internal_role(auth.uid())))
-- also ohne jeden Zeilenbezug. Dasselbe gilt fuer `finanzierungen`.
-- `is_internal_role` umfasst auch `vertriebspartner`. Ein angemeldeter
-- Vertriebspartner konnte damit ueber einen direkten Aufruf
--   supabase.from('investments').select('*')
-- alle rund 8.230 Investments lesen, samt `meta` (Selbstauskunft, Notardaten,
-- Dokumentenstaende). In der Oberflaeche sah er sie nicht, weil jede Auswertung
-- das Investment ueber `kontakte` nachschlaegt und `kontakte` fuer ihn seit
-- 20260517073534 zeilenweise abgesichert ist. Ein ausgeblendeter Knopf ist
-- aber keine Zugriffskontrolle.
--
-- WAS SICH AENDERT
--
-- Beide Tabellen bekommen genau die Abgrenzung, die `kontakte` bekommt. Damit
-- geben Kontakt und Investment immer dieselbe Antwort: Wer den Kunden sehen
-- darf, darf auch sein Investment sehen, und sonst niemand.
--
--   breiter Zugriff  = darf_alle_kunden_sehen, also die Entscheidung vom
--                      16.09.2026: admin, inhaber, vertriebsleiter,
--                      backoffice, finanzierungspartner, buchhaltung,
--                      setterin, dazu individuell und testaccount
--   eigene Zeile     = is_vp_owner_of_kontakt auf dem Kunden des Investments,
--                      also Zustaendigkeit, Ersteller, Empfehlungsgeber oder
--                      eine heute laufende Vertretung (20260807150000)
--
-- GEAENDERT AM 16.09.2026
--
-- Diese Datei war am 15.09.2026 vorbereitet, aber nie ausgefuehrt. Sie trug
-- damals die alte Regel "is_admin_role ODER (is_internal_role UND NICHT
-- vertriebspartner)" in einer eigenen Funktion `hat_breiten_investmentzugriff`.
-- Christians Entscheidung vom 16.09.2026 ersetzt diese Regel. Die Datei ist
-- deshalb auf `darf_alle_kunden_sehen` umgestellt und von 20260915200000 auf
-- 20260916191000 umnummeriert worden, damit sie nach der Entscheidung laeuft.
-- Eine eigene Investmentregel gibt es nicht mehr, sonst haetten wir wieder
-- zwei Wahrheiten.
--
-- WER ZUGRIFF VERLIERT
--
--   objektpartner, hausverwaltung, marketing, hr, versicherungsexperte
--
-- Sie sehen ab dem Lauf kein Investment und keine Finanzierung mehr. Wer mit
-- einem dieser Zugaenge arbeitet, sieht leere Listen und Kacheln auf Null.
-- Das ist gewollt, siehe 20260916190000_kundenzugriff_rollenentscheidung.sql.
--
-- Fuer alle uebrigen Rollen wird die Regel nur enger oder bleibt gleich.
--
-- WAS UNVERAENDERT BLEIBT
--
--   "Kunden sehen eigene Investments"    (20260517094425)
--   "Kunden sehen eigene Finanzierungen" (20260517094425)
-- Diese beiden Regeln werden hier nicht angefasst. Ein Kunde sieht weiterhin
-- genau seine eigenen Zeilen, auch als zweite Person am Vertrag.
--
-- Das Loeschen bleibt inhaltlich, wie es war: Admin/Inhaber oder der
-- zustaendige Vertriebspartner (20260813064020). Es wird hier NICHT auf die
-- breite Rollenliste ausgeweitet, das waere ein neues Recht und keine
-- Einschraenkung.
--
-- REIHENFOLGE, WICHTIG
--
-- `20260915141000_rls_rollenpruefung_je_abfrage.sql` legt dieselben
-- Policynamen mit der alten, unbegrenzten Fassung an. Laeuft sie NACH dieser
-- Datei, ist die Eingrenzung stillschweigend wieder weg. Sie muss also vorher
-- laufen oder gar nicht mehr.
--
-- Mehrfach ausfuehrbar: jede Regel erst DROP IF EXISTS, dann CREATE.
--
-- ---------------------------------------------------------------------------
-- SICHERUNG: heutigen Stand vor dem Ausfuehren festhalten
-- ---------------------------------------------------------------------------
--
-- Diese Abfrage aendert nichts. Ergebnis wegspeichern, dann laesst sich jede
-- Regel im Wortlaut wiederherstellen:
--
--   select tablename, policyname, cmd, roles, qual, with_check
--     from pg_policies
--    where schemaname = 'public'
--      and tablename in ('investments', 'finanzierungen')
--    order by tablename, cmd, policyname;
--
-- Und als fertige CREATE-Befehle zum Zurueckspielen:
--
--   select format(
--            'CREATE POLICY %I ON public.%I FOR %s TO %s%s%s;',
--            policyname, tablename, cmd, array_to_string(roles, ', '),
--            coalesce(' USING (' || qual || ')', ''),
--            coalesce(' WITH CHECK (' || with_check || ')', ''))
--     from pg_policies
--    where schemaname = 'public'
--      and tablename in ('investments', 'finanzierungen');
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1) Breiter Zugriff: haengt nur vom Nutzer ab, nie von der Zeile
-- ---------------------------------------------------------------------------
--
-- Hier stand bis zum 16.09.2026 eine eigene Funktion
-- `hat_breiten_investmentzugriff`. Sie ist entfallen. Der breite Zugriff auf
-- Investments und Finanzierungen ist derselbe wie auf Kontakte und steht in
-- `public.darf_alle_kunden_sehen` (20260916190000). Diese Datei setzt sie
-- voraus und laeuft deshalb nach ihr.
--
-- Weil sie nur vom angemeldeten Nutzer abhaengt, steht sie in den Regeln in
-- `(select ...)` und laeuft einmal je Abfrage statt einmal je Zeile (Muster
-- aus 20260827220000 und 20260915141000).


-- ---------------------------------------------------------------------------
-- 2) Eigenes Investment: der einzige Teil, der je Zeile laufen muss
-- ---------------------------------------------------------------------------
--
-- Nach dem Muster von `ist_eigener_kontakt` (20260827220000). Bewusst mit
-- `uuid` statt `text`: `investments.kunde_id` ist seit 20260517094425 eine
-- echte uuid mit Fremdschluessel auf `kontakte(id)`, der Umweg ueber Text und
-- eine Formatpruefung entfaellt.
--
-- SECURITY DEFINER, damit die Pruefung nicht selbst wieder an der
-- Zeilensicherheit von `kontakte` haengt; die Zustaendigkeit wird hier
-- ausdruecklich geprueft. `is_vp_owner_of_kontakt` ist dieselbe Funktion, die
-- auch die Kontaktregel benutzt: Zustaendigkeit, `meta->>erstelltVonId`,
-- `meta->>empfehlungsgeberVpId` oder eine heute laufende Vertretung.

CREATE OR REPLACE FUNCTION public.ist_eigenes_investment(_user_id uuid, _kunde_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _kunde_id IS NOT NULL
     AND EXISTS (
       SELECT 1
         FROM public.kontakte k
        WHERE k.id = _kunde_id
          AND public.is_vp_owner_of_kontakt(_user_id, k.zustaendig_id, k.meta)
     )
$$;

COMMENT ON FUNCTION public.ist_eigenes_investment(uuid, uuid) IS
  'Gehoert das Investment zu einem Kunden, fuer den dieser Nutzer zustaendig '
  'ist? Dieselbe Pruefung wie ist_eigener_kontakt, nur ueber investments.kunde_id.';

REVOKE ALL ON FUNCTION public.ist_eigenes_investment(uuid, uuid) FROM public;
REVOKE ALL ON FUNCTION public.ist_eigenes_investment(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.ist_eigenes_investment(uuid, uuid) TO authenticated;


-- ---------------------------------------------------------------------------
-- 3) Eigene Finanzierung: ein Schritt mehr
-- ---------------------------------------------------------------------------
--
-- ACHTUNG, Stolperstelle: `finanzierungen.kunde_id` ist TEXT und enthaelt
-- trotz seines Namens die INVESTMENT-ID, nicht die Kontakt-ID. So wird die
-- Spalte seit jeher geschrieben (`src/lib/finanzierungStore.ts`, Kopfkommentar),
-- so liest sie die Kundenregel aus 20260517094425, und so setzt es die
-- Loeschroutine aus 20260603110100 voraus. Der Weg zum Kunden geht deshalb
-- ueber `investments`.
--
-- Die Formatpruefung vor dem Cast ist noetig, weil die Spalte Text ist: ohne
-- sie wuerde ein nicht castbarer Altbestand die ganze Abfrage mit einem Fehler
-- abbrechen statt die Zeile nur auszublenden. Anders als in
-- `ist_eigener_kontakt` bewusst `~*` statt `~`, damit eine in Grossbuchstaben
-- abgelegte Kennung nicht still unsichtbar wird; falsch positiv kann das nicht
-- werden, weil danach der Vergleich auf die Investment-ID folgt.

CREATE OR REPLACE FUNCTION public.ist_eigene_finanzierung(_user_id uuid, _investment_id_text text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _investment_id_text IS NOT NULL
     AND _investment_id_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     AND EXISTS (
       SELECT 1
         FROM public.investments i
         JOIN public.kontakte k ON k.id = i.kunde_id
        WHERE i.id = _investment_id_text::uuid
          AND public.is_vp_owner_of_kontakt(_user_id, k.zustaendig_id, k.meta)
     )
$$;

COMMENT ON FUNCTION public.ist_eigene_finanzierung(uuid, text) IS
  'Gehoert die Finanzierung zu einem Investment eines Kunden, fuer den dieser '
  'Nutzer zustaendig ist? finanzierungen.kunde_id enthaelt die Investment-ID.';

REVOKE ALL ON FUNCTION public.ist_eigene_finanzierung(uuid, text) FROM public;
REVOKE ALL ON FUNCTION public.ist_eigene_finanzierung(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.ist_eigene_finanzierung(uuid, text) TO authenticated;


-- ---------------------------------------------------------------------------
-- 4) Altlasten: Regeln aus der Zeit vor der Rollenpruefung
-- ---------------------------------------------------------------------------
--
-- Diese Namen stammen aus 20260314101936 (`USING (true)`) und wurden am
-- 16.03.2026 ersetzt. Sie sollten laengst weg sein. Weil eine permissive
-- Policy jede strenge daneben mit ODER aufhebt, wird hier sicherheitshalber
-- noch einmal aufgeraeumt. Ist nichts da, tut der Befehl nichts.

DROP POLICY IF EXISTS "Alle sehen Investments" ON public.investments;
DROP POLICY IF EXISTS "Auth bearbeiten Investments" ON public.investments;
DROP POLICY IF EXISTS "Auth erstellen Investments" ON public.investments;
DROP POLICY IF EXISTS "Admins loeschen Investments" ON public.investments;

DROP POLICY IF EXISTS "Alle sehen Finanzierungen" ON public.finanzierungen;
DROP POLICY IF EXISTS "Auth bearbeiten Finanzierungen" ON public.finanzierungen;
DROP POLICY IF EXISTS "Auth erstellen Finanzierungen" ON public.finanzierungen;


-- ---------------------------------------------------------------------------
-- 5) investments
-- ---------------------------------------------------------------------------

-- Lesen. Ersetzt 20260316100536 / 20260915141000.
DROP POLICY IF EXISTS "Interne sehen Investments" ON public.investments;
CREATE POLICY "Interne sehen Investments"
  ON public.investments
  FOR SELECT
  TO authenticated
  USING (
    (select public.is_internal_role(auth.uid()))
    AND (
      (select public.darf_alle_kunden_sehen(auth.uid()))
      OR public.ist_eigenes_investment(auth.uid(), investments.kunde_id)
    )
  );

-- Bearbeiten. Neu ist das ausgeschriebene WITH CHECK: Ohne es setzt Postgres
-- zwar den USING-Ausdruck auch als Pruefung der neuen Zeile ein, aber das
-- steht nirgends hin und faellt beim naechsten Umbau leicht weg. Ausgeschrieben
-- ist festgehalten, dass ein Vertriebspartner ein Investment nicht auf einen
-- fremden Kunden umschreiben und es damit aus seiner Sicht wegschieben kann.
DROP POLICY IF EXISTS "Interne bearbeiten Investments" ON public.investments;
CREATE POLICY "Interne bearbeiten Investments"
  ON public.investments
  FOR UPDATE
  TO authenticated
  USING (
    (select public.is_internal_role(auth.uid()))
    AND (
      (select public.darf_alle_kunden_sehen(auth.uid()))
      OR public.ist_eigenes_investment(auth.uid(), investments.kunde_id)
    )
  )
  WITH CHECK (
    (select public.is_internal_role(auth.uid()))
    AND (
      (select public.darf_alle_kunden_sehen(auth.uid()))
      OR public.ist_eigenes_investment(auth.uid(), investments.kunde_id)
    )
  );

-- Anlegen. Ein Vertriebspartner legt nur noch fuer eigene Kunden an.
DROP POLICY IF EXISTS "Interne erstellen Investments" ON public.investments;
CREATE POLICY "Interne erstellen Investments"
  ON public.investments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (select public.is_internal_role(auth.uid()))
    AND (
      (select public.darf_alle_kunden_sehen(auth.uid()))
      OR public.ist_eigenes_investment(auth.uid(), investments.kunde_id)
    )
  );

-- Loeschen. Inhaltlich unveraendert gegenueber 20260813064020, nur ist das
-- ausgeschriebene EXISTS jetzt die Hilfsfunktion. Absichtlich NICHT auf die
-- breite Rollenliste ausgeweitet.
DROP POLICY IF EXISTS "Admins und zustaendige VP loeschen Investments" ON public.investments;
CREATE POLICY "Admins und zustaendige VP loeschen Investments"
  ON public.investments
  FOR DELETE
  TO authenticated
  USING (
    (select public.is_admin_role(auth.uid()))
    OR public.ist_eigenes_investment(auth.uid(), investments.kunde_id)
  );


-- ---------------------------------------------------------------------------
-- 6) finanzierungen
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Interne sehen Finanzierungen" ON public.finanzierungen;
CREATE POLICY "Interne sehen Finanzierungen"
  ON public.finanzierungen
  FOR SELECT
  TO authenticated
  USING (
    (select public.is_internal_role(auth.uid()))
    AND (
      (select public.darf_alle_kunden_sehen(auth.uid()))
      OR public.ist_eigene_finanzierung(auth.uid(), finanzierungen.kunde_id)
    )
  );

DROP POLICY IF EXISTS "Interne bearbeiten Finanzierungen" ON public.finanzierungen;
CREATE POLICY "Interne bearbeiten Finanzierungen"
  ON public.finanzierungen
  FOR UPDATE
  TO authenticated
  USING (
    (select public.is_internal_role(auth.uid()))
    AND (
      (select public.darf_alle_kunden_sehen(auth.uid()))
      OR public.ist_eigene_finanzierung(auth.uid(), finanzierungen.kunde_id)
    )
  )
  WITH CHECK (
    (select public.is_internal_role(auth.uid()))
    AND (
      (select public.darf_alle_kunden_sehen(auth.uid()))
      OR public.ist_eigene_finanzierung(auth.uid(), finanzierungen.kunde_id)
    )
  );

DROP POLICY IF EXISTS "Interne erstellen Finanzierungen" ON public.finanzierungen;
CREATE POLICY "Interne erstellen Finanzierungen"
  ON public.finanzierungen
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (select public.is_internal_role(auth.uid()))
    AND (
      (select public.darf_alle_kunden_sehen(auth.uid()))
      OR public.ist_eigene_finanzierung(auth.uid(), finanzierungen.kunde_id)
    )
  );

-- Eine DELETE-Regel gibt es auf `finanzierungen` bewusst weiterhin nicht.
-- Geloescht wird dort nur ueber die Routine aus 20260603110100, die mit den
-- Rechten ihres Erstellers laeuft.


-- ---------------------------------------------------------------------------
-- 7) Indizes
-- ---------------------------------------------------------------------------
--
-- Gepruefte Frage: reicht `investments(kunde_id)`? Ja. Die zeilenweise Regel
-- schlaegt den Kunden ueber `kontakte(id)` nach, also ueber den
-- Primaerschluessel; ein Index auf `investments(kunde_id)` wird dafuer gar
-- nicht gebraucht, er hilft den Aufrufen der App
-- (`.eq('kunde_id', kontaktId)`). Er existiert seit 20260425083849, wird hier
-- nur sicherheitshalber nachgezogen.
--
-- `ist_eigene_finanzierung` geht ueber `investments(id)`, ebenfalls der
-- Primaerschluessel. Die Vertretungspruefung nutzt
-- `idx_abwesenheiten_user_zeitraum` aus 20260807150000.
--
-- Ein neuer Index ist also nicht noetig.

CREATE INDEX IF NOT EXISTS idx_investments_kunde_id
  ON public.investments (kunde_id);


-- ===========================================================================
-- PRUEFUNG NACH DEM AUSFUEHREN (aendert nichts)
-- ===========================================================================
--
-- 1) Alle Regeln der beiden Tabellen auflisten. Bei `investments` muessen fuenf
--    stehen (vier interne plus "Kunden sehen eigene Investments"), bei
--    `finanzierungen` vier.
--
--   select tablename, policyname, cmd, qual, with_check
--     from pg_policies
--    where schemaname = 'public'
--      and tablename in ('investments', 'finanzierungen')
--    order by tablename, cmd, policyname;
--
-- 2) Gegenprobe je Nutzer, ohne sich anmelden zu muessen. <UUID> durch die
--    Nutzerkennung aus `auth.users` ersetzen:
--
--   select public.darf_alle_kunden_sehen('<UUID>'::uuid) as sieht_alles,
--          count(*) filter (
--            where public.ist_eigenes_investment('<UUID>'::uuid, i.kunde_id)
--          ) as eigene,
--          count(*) as gesamt
--     from public.investments i;
--
--    Erwartung fuer einen Vertriebspartner: `sieht_alles` = false und
--    `eigene` deutlich kleiner als `gesamt`. Fuer Backoffice, Buchhaltung,
--    Vertriebsleitung, Finanzierungspartner und Setterin: `sieht_alles` = true.
--    Fuer Objektpartner, Hausverwaltung, Marketing, HR und
--    Versicherungsexperte: `sieht_alles` = false und `eigene` = 0.
--
-- 3) Der scharfe Test, direkt im SQL-Editor: sich fuer die Dauer einer
--    Transaktion als dieser Nutzer ausgeben und zaehlen. Aendert nichts, das
--    ROLLBACK am Ende nimmt alles zurueck.
--
--   begin;
--     set local role authenticated;
--     set local request.jwt.claims = '{"sub":"<UUID>","role":"authenticated"}';
--     select count(*) as sichtbare_investments from public.investments;
--     select count(*) as sichtbare_finanzierungen from public.finanzierungen;
--   rollback;
--
--    Erwartung fuer einen Vertriebspartner: deutlich weniger als die rund
--    8.230 Zeilen der Tabelle, und zwar genau die Zahl aus Schritt 2.
-- ===========================================================================
