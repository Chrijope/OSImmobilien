-- ===========================================================================
-- Kennzahlen-Tagesstand: jede Nacht ein Schnappschuss der wichtigsten Zahlen
-- ===========================================================================
--
-- WOZU DAS DA IST
--
-- Das System kennt heute nur den Jetztzustand. Auf jeder Seite steht, wie
-- viele offene Leads es gerade gibt, aber nirgends steht, wie viele es letzte
-- Woche waren. Damit laesst sich nicht sagen, ob eine Zahl gut oder schlecht
-- ist: 42 offene Leads sind eine Entwarnung, wenn es vor einer Woche 61 waren,
-- und ein Alarm, wenn es 20 waren.
--
-- Diese Migration legt deshalb eine schmale Tabelle an, in die jede Nacht je
-- Bereich eine Handvoll Zahlen geschrieben wird, dazu die Funktion, die sie
-- ausrechnet, den naechtlichen Zeitplan und eine Lesefunktion, die zu jeder
-- Kennzahl den heutigen Stand und den Stand vor sieben Tagen liefert.
--
-- WARUM REINES SQL UND KEINE EDGE FUNCTION
--
-- Eine Edge Function laeuft in Deno und kann `src/lib/` nicht mitbenutzen. Die
-- Rechenlogik laege dann ein zweites Mal vor, in einer zweiten Sprache, und
-- die beiden Fassungen wuerden auseinanderlaufen. Genau das ist beim
-- Mahnreport schon passiert: Vorgaenge in der Prozessmitte tauchten nie im
-- Bericht auf. Eine SQL-Funktion liest dieselben Tabellen wie die Oberflaeche,
-- braucht kein Geheimnis, faellt nicht aus, wenn eine Function nicht
-- ausgerollt wurde, und pg_cron ruft sie direkt ohne HTTP dazwischen. Dasselbe
-- Vorgehen wie bei der Nachtpruefung (20260805100000_nachtpruefung.sql).
--
-- WELCHE ZAHLEN HIER STEHEN, UND WELCHE BEWUSST NICHT
--
-- Ueber jeder Kennzahl steht die Stelle im TypeScript-Code, aus der ihre
-- Definition stammt. Wo eine Zahl in SQL nicht identisch zur Oberflaeche
-- nachbaubar ist, steht sie hier NICHT drin, sondern es steht ein Kommentar,
-- warum sie fehlt. Eine Zahl, die im Verlauf anders gerechnet wird als auf dem
-- Bildschirm, ist schlimmer als eine fehlende Zahl: Sie sieht richtig aus.
--
-- Nicht aufgenommen sind ausserdem:
--   * alles aus Entwurfsseiten, `/anrufe` hat alle Werte fest im Code
--     (src/pages/Anrufe.tsx:11),
--   * der Trichter des Analysetools, denn `analysetool_ereignisse` ist in der
--     Datenbank noch nicht angelegt (supabase/migrations-inbox/README.md),
--   * alles aus `localStorage` (Wissenswelt-Fortschritt, Rechnungsnummern,
--     die abgehakten Inbox-Zeilen),
--   * Tabellen, die von keinem Anwendungscode gelesen werden (`rechnungen`,
--     `rechnung_stammdaten`, `academy_progress`, `unterlagen_*`).
--
-- Alle Zahlen sind Zaehlungen ohne Personenbezug. In der Tabelle steht kein
-- Name, keine Kennung eines Kunden, kein Betrag.
--
-- Mehrfach ausfuehrbar: Die Migration legt nichts doppelt an und ein zweiter
-- Lauf am selben Tag ersetzt die Werte des Tages, statt sie zu verdoppeln.

-- ---------------------------------------------------------------------------
-- 1) Wohin die Zahlen geschrieben werden
-- ---------------------------------------------------------------------------
--
-- Bewusst schmal und nicht breit: eine Zeile je Tag, Bereich und Kennzahl. Ein
-- breites Schema mit einer Spalte je Kennzahl braeuchte fuer jede neue Zahl
-- eine Schemaaenderung, und jede Aenderung waere wieder eine Migration, die
-- von Hand im SQL-Editor laufen muss. So kostet eine neue Kennzahl nur eine
-- Zeile in der Sammelfunktion weiter unten.

CREATE TABLE IF NOT EXISTS public.kennzahlen_tagesstand (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Der Tag, fuer den die Zahl gilt, in deutscher Zeit. Nicht der Zeitpunkt
  -- des Laufs: Der liegt nachts und waere in UTC schon der Vortag.
  stichtag date NOT NULL,
  -- Eines der elf Abteilungskuerzel.
  bereich text NOT NULL,
  -- Kurzname der Kennzahl, etwa 'follow_ups_ueberfaellig'.
  kennzahl text NOT NULL,
  -- Der Wert. Numeric, damit spaeter auch eine Quote oder ein Betrag
  -- hineinpasst, ohne dass die Tabelle geaendert werden muss.
  wert numeric NOT NULL,
  -- Wann der Lauf die Zeile geschrieben hat. Bei einem zweiten Lauf am selben
  -- Tag wandert dieser Zeitstempel mit, der Stichtag bleibt.
  erfasst_am timestamptz NOT NULL DEFAULT now(),
  -- Ein Tippfehler im Bereich wuerde eine Kennzahl still aus jeder Auswertung
  -- fallen lassen. Deshalb die feste Liste.
  CONSTRAINT kennzahlen_tagesstand_bereich_chk CHECK (bereich IN (
    'AGL', 'OPS', 'VL', 'HR', 'MKT', 'OBJ', 'BO', 'FIN', 'AS', 'VA', 'CTR'
  )),
  -- Eindeutig je Tag, Bereich und Kennzahl. Ein zweiter Lauf am selben Tag
  -- ersetzt damit den Wert, statt eine zweite Zeile anzulegen.
  CONSTRAINT kennzahlen_tagesstand_eindeutig UNIQUE (stichtag, bereich, kennzahl)
);

-- Die haeufigste Abfrage ist "diese eine Kennzahl ueber die Zeit".
CREATE INDEX IF NOT EXISTS kennzahlen_tagesstand_reihe_idx
  ON public.kennzahlen_tagesstand (bereich, kennzahl, stichtag DESC);

ALTER TABLE public.kennzahlen_tagesstand ENABLE ROW LEVEL SECURITY;

-- Lesen duerfen die internen Rollen. Es stehen nur Zahlen drin, keine Namen,
-- aber es sind Firmenzahlen und die gehen einen Kunden oder Tippgeber nichts
-- an. `is_internal_role` ist dieselbe Pruefung, die schon auf `investments`
-- und `bewerbungen` gilt.
DROP POLICY IF EXISTS "Interne sehen den Kennzahlenverlauf" ON public.kennzahlen_tagesstand;
CREATE POLICY "Interne sehen den Kennzahlenverlauf"
  ON public.kennzahlen_tagesstand FOR SELECT TO authenticated
  USING (public.is_internal_role(auth.uid()));

-- Geschrieben wird ausschliesslich von der Sammelfunktion weiter unten. Sie
-- laeuft als SECURITY DEFINER und geht deshalb an der Zeilensicherheit vorbei.
-- Es gibt bewusst KEINE Policy fuer INSERT, UPDATE oder DELETE: Ohne Policy
-- kommt ueber die normale Schnittstelle niemand hinein, auch kein
-- Administrator. Der Verlauf soll sich nicht von Hand schoenrechnen lassen.
GRANT SELECT ON public.kennzahlen_tagesstand TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.kennzahlen_tagesstand FROM authenticated;
REVOKE ALL ON public.kennzahlen_tagesstand FROM anon;

COMMENT ON TABLE public.kennzahlen_tagesstand IS
  'Naechtlicher Schnappschuss der Kennzahlen je Abteilung. Eine Zeile je '
  'Stichtag, Bereich und Kennzahl. Geschrieben allein von '
  'public.kennzahlen_tagesstand_lauf(), gelesen ueber '
  'public.kennzahlen_verlauf(). Enthaelt keine personenbezogenen Daten.';

-- ---------------------------------------------------------------------------
-- 2) Zwei kleine Helfer
-- ---------------------------------------------------------------------------

-- Schreibt einen Wert. Beim zweiten Lauf am selben Tag wird der alte ersetzt.
CREATE OR REPLACE FUNCTION public.kennzahl_schreiben(
  _stichtag date, _bereich text, _kennzahl text, _wert numeric
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.kennzahlen_tagesstand (stichtag, bereich, kennzahl, wert)
  VALUES (_stichtag, _bereich, _kennzahl, _wert)
  ON CONFLICT (stichtag, bereich, kennzahl)
  DO UPDATE SET wert = EXCLUDED.wert, erfasst_am = now();
$$;

REVOKE ALL ON FUNCTION public.kennzahl_schreiben(date, text, text, numeric) FROM anon, authenticated;

/*
 * Die Pipelinestufe so lesen, wie die Statistik sie liest.
 *
 * Wortgetreue Uebersetzung von `normalizeStufe` aus
 * src/lib/statistikTrichter.ts:30. Ohne sie zaehlen Altbestand und
 * zusammengelegte Stufen in der falschen Spalte: "erstgespraech" und
 * "erstgespraech_geplant" sind seit der Zusammenlegung dieselbe Stufe,
 * "zugewiesen" ist der Anfang des Trichters und nicht "nicht erreicht".
 *
 * Eine leere Stufe gilt als "neuer_lead", genau wie dort.
 */
CREATE OR REPLACE FUNCTION public.kennzahl_stufe(_roh text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN _roh IS NULL OR _roh = '' THEN 'neuer_lead'
    WHEN _roh = 'bedarfsanalyse'            THEN 'erstgespraech_geplant'
    WHEN _roh = 'erstgespraech'             THEN 'erstgespraech_geplant'
    WHEN _roh IN ('after_sales', 'aftersales') THEN 'faelligkeit'
    WHEN _roh = 'closing'                   THEN 'objektauswahl'
    WHEN _roh = 'zugewiesen'                THEN 'neuer_lead'
    WHEN _roh = 'kontaktversuche'           THEN 'nicht_erreicht'
    WHEN _roh = 'vermoegensaufbau'          THEN 'erreicht'
    ELSE _roh
  END;
$$;

COMMENT ON FUNCTION public.kennzahl_stufe(text) IS
  'Pipelinestufe wie in src/lib/statistikTrichter.ts:30 (normalizeStufe). '
  'Nur fuer die Kennzahlen gedacht, aendert nichts an gespeicherten Daten.';

/*
 * Den Bewerberstatus so lesen, wie das Bewerbungsmanagement ihn liest.
 *
 * Wortgetreue Uebersetzung von `migrateStatus` aus
 * src/lib/bewerbungStore.ts:66 samt der Umschreibtabelle darueber (:50).
 * Alte Werte wie "Screening" oder "Kooperationsgespraech" stehen weiterhin in
 * der Datenbank; ohne diese Umschrift fielen sie in die Auffangstufe
 * "Eingang" und der Verlauf zeigte einen Eingangsstapel, den es nicht gibt.
 */
CREATE OR REPLACE FUNCTION public.kennzahl_bewerberstatus(_roh text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  -- Leer oder nicht gesetzt heisst "Eingang", genau wie das `|| "Eingang"` an
  -- der Aufrufstelle in src/lib/bewerbungStore.ts:660.
  WITH roh AS (SELECT coalesce(nullif(_roh, ''), 'Eingang') AS s)
  SELECT CASE
    WHEN roh.s = 'Screening'             THEN 'Erstgespraech'
    WHEN roh.s = '16P-Test'              THEN 'Erstgespraech'
    WHEN roh.s = 'Interview'             THEN 'Closing'
    WHEN roh.s = 'Entscheidung'          THEN 'Paketwahl'
    WHEN roh.s = 'Kooperationsgespraech' THEN 'Closing'
    WHEN roh.s = 'Nutzeranlage'          THEN 'Nutzer_anlegen'
    WHEN roh.s = 'Onboarding'            THEN 'Nutzer_anlegen'
    WHEN roh.s = 'Academy'               THEN 'Nutzer_anlegen'
    WHEN roh.s IN ('Zurueckgezogen', 'Zurückgezogen') THEN 'Abgelehnt'
    WHEN roh.s IN (
      'Eingang', 'Erstgespraech', 'Closing', 'FollowUp', 'Bedenkzeit',
      'Paketwahl', 'Vertrag', 'Rechnung', 'Nutzer_anlegen', 'Aktiv',
      'Abgelehnt', 'KeinInteresse'
    ) THEN roh.s
    ELSE 'Eingang'
  END
  FROM roh;
$$;

COMMENT ON FUNCTION public.kennzahl_bewerberstatus(text) IS
  'Bewerberstatus wie in src/lib/bewerbungStore.ts:66 (migrateStatus). '
  'Nur fuer die Kennzahlen gedacht, aendert nichts an gespeicherten Daten.';

-- ---------------------------------------------------------------------------
-- 3) Der naechtliche Lauf
-- ---------------------------------------------------------------------------
--
-- Jeder Bereich hat seinen eigenen Block mit eigenem Fehlerabfang. Faellt
-- einer aus, etwa weil eine Tabelle noch nicht angelegt ist, laufen die
-- uebrigen trotzdem durch und der Ausfall meldet sich als NOTICE. Ein
-- Waechter, der beim ersten Stolperer stehen bleibt, ist schlimmer als keiner.
-- Innerhalb eines Bereichs gilt das nicht: Ein Fehler macht dort alles
-- rueckgaengig, auch die Zeilen, die vorher schon geschrieben waren. Der
-- ganze Bereich fehlt dann fuer diesen Tag, statt halb gefuellt dazustehen.
--
-- WICHTIG ZUM VERSTAENDNIS DER ZAHLEN: Gezaehlt wird immer das ganze Haus.
-- Auf dem Bildschirm haengt fast jede Zahl daran, wer hinsieht, denn ein
-- Vertriebspartner sieht nur seine Kunden und ein Vertriebsleiter sein Team
-- (src/lib/datenSicht.ts:34 und :37). Der Verlauf kennt diese Einschraenkung
-- nicht; er ist die Hausansicht, so wie ein Inhaber sie sieht.

CREATE OR REPLACE FUNCTION public.kennzahlen_tagesstand_lauf()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Der Stichtag in deutscher Zeit. Der Lauf liegt nachts; in UTC waere das
  -- Datum je nach Jahreszeit noch der Vortag.
  v_tag date := (now() AT TIME ZONE 'Europe/Berlin')::date;
  -- Heute in UTC, so wie die Oberflaeche und die Eskalationsdienste rechnen,
  -- wenn sie einen ISO-Zeitstempel auf zehn Stellen kuerzen.
  v_heute_utc date := (now() AT TIME ZONE 'UTC')::date;
  v_geschrieben integer := 0;
  v_zahl bigint;
  v_gesamt bigint;
BEGIN
  -- Aelteres aufraeumen. Zwei Jahre reichen fuer jeden Vergleich, den jemand
  -- wirklich zieht, und die Tabelle bleibt winzig.
  DELETE FROM public.kennzahlen_tagesstand WHERE stichtag < v_tag - 730;

  -- ═══════════════════════════════════════════════════════════════════════
  -- AGL: Assistenz der Geschaeftsleitung, Gesamtsicht
  -- ═══════════════════════════════════════════════════════════════════════
  BEGIN
    /*
     * Aktive Kontakte. In der Statistik heisst dieselbe Zahl "Interessenten
     * registriert" (src/pages/Statistiken.tsx:798). Die Menge dahinter ist
     * `filteredKontakte` (src/pages/Statistiken.tsx:291): nicht archiviert und
     * nicht geloescht. Der Zeitraumfilter steht dort auf "seit_anfang"
     * (src/pages/Statistiken.tsx:233), umfasst also alles.
     */
    SELECT count(*) INTO v_gesamt
      FROM public.kontakte k
     WHERE coalesce(k.archiviert, false) = false
       AND coalesce(k.geloescht, false) = false;
    PERFORM public.kennzahl_schreiben(v_tag, 'AGL', 'kontakte_aktiv', v_gesamt);
    v_geschrieben := v_geschrieben + 1;

    /*
     * Reservierungen erstellt: alle Kontakte, die mindestens die Stufe
     * Reservierung erreicht haben oder ein Reservierungsdatum tragen.
     * Definition: src/pages/Statistiken.tsx:761 (Liste RESERVIERT_PLUS) und
     * :763 (`|| !!k.meta?.reservierungsDatum`).
     */
    SELECT count(*) INTO v_zahl
      FROM public.kontakte k
     WHERE coalesce(k.archiviert, false) = false
       AND coalesce(k.geloescht, false) = false
       AND (
         public.kennzahl_stufe(k.meta->>'pipelineStufe') IN (
           'reservierung', 'finanzierung', 'notar', 'faelligkeit', 'abrechnung', 'abgeschlossen'
         )
         OR coalesce(k.meta->>'reservierungsDatum', '') <> ''
       );
    PERFORM public.kennzahl_schreiben(v_tag, 'AGL', 'reservierungen_erstellt', v_zahl);
    v_geschrieben := v_geschrieben + 1;

    /*
     * Abschluesse. Zaehler der Abschlussquote in der Statistik
     * (src/pages/Statistiken.tsx:785). Bewusst diese drei Stufen und nicht
     * `ABSCHLUSS_STUFEN` aus src/lib/abschlussDefinition.ts:17: Jene Liste
     * enthaelt zusaetzlich "notar", die Statistik zaehlt einen Notartermin
     * erst ab Faelligkeit als Abschluss. Beide Definitionen gibt es im Code,
     * hier gilt die der Statistikseite, weil dort die Zahl steht, die jemand
     * mit dem Verlauf vergleichen wird.
     */
    SELECT count(*) INTO v_zahl
      FROM public.kontakte k
     WHERE coalesce(k.archiviert, false) = false
       AND coalesce(k.geloescht, false) = false
       AND public.kennzahl_stufe(k.meta->>'pipelineStufe') IN ('faelligkeit', 'abrechnung', 'abgeschlossen');
    PERFORM public.kennzahl_schreiben(v_tag, 'AGL', 'abschluesse', v_zahl);
    v_geschrieben := v_geschrieben + 1;

    /*
     * Partner aktiv: interne Rollen mit einem nicht gesperrten Profil.
     * Definition src/pages/Statistiken.tsx:768 bis :782. Die dortige Pruefung
     * `!p.geloescht && !p.deleted_at` laeuft ins Leere, weil `profiles` diese
     * beiden Spalten nicht hat; in JavaScript ist ein fehlendes Feld falsch,
     * die Bedingung ist also immer erfuellt. Uebrig bleibt `gesperrt`.
     */
    SELECT count(DISTINCT r.user_id) INTO v_zahl
      FROM public.user_roles r
      JOIN public.profiles p ON p.id = r.user_id
     WHERE r.role::text IN (
             'vertriebspartner', 'vertriebsleiter', 'setterin', 'admin', 'inhaber',
             'marketing', 'hr', 'backoffice', 'buchhaltung', 'hausverwaltung',
             'versicherungsexperte'
           )
       AND coalesce(p.gesperrt, false) = false;
    PERFORM public.kennzahl_schreiben(v_tag, 'AGL', 'partner_aktiv', v_zahl);
    v_geschrieben := v_geschrieben + 1;

    /*
     * Aktive Investments zu sichtbaren Kontakten (src/pages/Statistiken.tsx:791).
     * `investments.kunde_id` ist Text und traegt die Kontakt-Kennung, deshalb
     * der Vergleich mit `k.id::text`, genau wie in
     * supabase/migrations/20260807190000_sla_verstoesse_fuer_die_aufsicht.sql.
     */
    SELECT count(*) INTO v_zahl
      FROM public.investments i
      JOIN public.kontakte k ON k.id::text = i.kunde_id
     WHERE coalesce(i.status, '') NOT IN ('storniert', 'geloescht')
       AND coalesce(k.archiviert, false) = false
       AND coalesce(k.geloescht, false) = false;
    PERFORM public.kennzahl_schreiben(v_tag, 'AGL', 'investments_aktiv', v_zahl);
    v_geschrieben := v_geschrieben + 1;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Bereich AGL uebersprungen: %', SQLERRM;
  END;

  -- ═══════════════════════════════════════════════════════════════════════
  -- OPS: Operative Leitung, Prozesse
  -- ═══════════════════════════════════════════════════════════════════════
  BEGIN
    /*
     * Offene Aufgaben. "Offen" heisst im ganzen Projekt: weder erledigt noch
     * abgesagt (src/lib/aufgabenStore.ts:138, ebenso
     * src/lib/dashboardKpis.ts:269).
     */
    SELECT count(*) INTO v_zahl
      FROM public.aufgaben a
     WHERE a.status::text NOT IN ('erledigt', 'abgesagt');
    PERFORM public.kennzahl_schreiben(v_tag, 'OPS', 'aufgaben_offen', v_zahl);
    v_geschrieben := v_geschrieben + 1;

    /*
     * Ueberfaellige Aufgaben. Ueberfaellig ist im Projekt an genau einer
     * Stelle definiert (src/lib/faelligkeit.ts:48, benutzt in
     * src/lib/dashboardKpis.ts:268):
     *
     *   - liegt das Datum vor heute, ist es ueberfaellig,
     *   - liegt es nach heute, nicht,
     *   - ist es heute, entscheidet die Uhrzeit, und ohne Uhrzeit hat man den
     *     ganzen Tag Zeit.
     *
     * Das Datum kommt dort aus den ersten zehn Zeichen des Zeitstempels, den
     * die Schnittstelle liefert, und der ist in UTC. Deshalb hier
     * `AT TIME ZONE 'UTC'`. Verglichen wird mit dem heutigen Tag in deutscher
     * Zeit, denn "heute" ist im Browser die Ortszeit
     * (src/lib/faelligkeit.ts:37).
     */
    SELECT count(*) INTO v_zahl
      FROM public.aufgaben a
     WHERE a.status::text NOT IN ('erledigt', 'abgesagt')
       AND a.faellig_am IS NOT NULL
       AND (
         (a.faellig_am AT TIME ZONE 'UTC')::date < v_tag
         OR (
           (a.faellig_am AT TIME ZONE 'UTC')::date = v_tag
           AND a.uhrzeit IS NOT NULL
           AND a.uhrzeit < (now() AT TIME ZONE 'Europe/Berlin')::time
         )
       );
    PERFORM public.kennzahl_schreiben(v_tag, 'OPS', 'aufgaben_ueberfaellig', v_zahl);
    v_geschrieben := v_geschrieben + 1;

    /*
     * Offene Follow-Ups (src/lib/followUpStore.ts:57 und die serverseitige
     * Entsprechung in
     * supabase/functions/send-followup-overdue-nudges/index.ts:86).
     */
    SELECT count(*) INTO v_zahl
      FROM public.follow_ups f
     WHERE coalesce(f.status, 'offen') = 'offen';
    PERFORM public.kennzahl_schreiben(v_tag, 'OPS', 'follow_ups_offen', v_zahl);
    v_geschrieben := v_geschrieben + 1;

    /*
     * Liegengebliebene Follow-Ups: offen und das Faelligkeitsdatum ist vorbei.
     * Wortgleich zur taeglichen Mahnung
     * (supabase/functions/send-followup-overdue-nudges/index.ts:86 mit
     * `today` aus :10, also dem heutigen Tag in UTC). `faellig_am` ist dort
     * eine Textspalte im Format JJJJ-MM-TT und wird als Text verglichen.
     */
    SELECT count(*) INTO v_zahl
      FROM public.follow_ups f
     WHERE coalesce(f.status, 'offen') = 'offen'
       AND f.faellig_am IS NOT NULL
       AND f.faellig_am < to_char(v_heute_utc, 'YYYY-MM-DD');
    PERFORM public.kennzahl_schreiben(v_tag, 'OPS', 'follow_ups_ueberfaellig', v_zahl);
    v_geschrieben := v_geschrieben + 1;

    /*
     * Kontakte ohne Zustaendigen. Dasselbe Praedikat wie in der Nachtpruefung
     * (supabase/migrations/20260807130000_nachtpruefung_pool_drei_tage.sql:62):
     * entweder liegt der Kontakt laenger als drei Tage im offenen Pool, oder
     * an ihm laeuft bereits etwas. Der offene Pool ist ein Zwischenlager,
     * keine Ablage.
     */
    SELECT count(*) INTO v_zahl
      FROM public.kontakte k
     WHERE k.zustaendig_id IS NULL
       AND coalesce(k.geloescht, false) = false
       AND (
         k.erstellt_am < now() - interval '3 days'
         OR EXISTS (SELECT 1 FROM public.signature_requests s
                     WHERE s.kontakt_id = k.id AND s.status = 'pending')
         OR EXISTS (SELECT 1 FROM public.investments i WHERE i.kunde_id = k.id::text)
         OR EXISTS (SELECT 1 FROM public.buchungen b
                     WHERE b.kontakt_id = k.id AND b.status = 'offen')
       );
    PERFORM public.kennzahl_schreiben(v_tag, 'OPS', 'kontakte_ohne_zustaendigen', v_zahl);
    v_geschrieben := v_geschrieben + 1;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Bereich OPS uebersprungen: %', SQLERRM;
  END;

  -- Die Befunde der Nachtpruefung stehen in einem eigenen Block, damit die
  -- uebrigen OPS-Zahlen erhalten bleiben, falls es die Tabelle einmal nicht
  -- gibt.
  BEGIN
    /*
     * Wie viele Pruefungen des letzten Nachtlaufs etwas gefunden haben.
     * Dieselbe Auswahl wie der Bericht auf /nachtpruefung
     * (public.nachtpruefung_bericht() in
     * supabase/migrations/20260805100000_nachtpruefung.sql): der jeweils
     * letzte Lauf, gezaehlt werden die Zeilen mit Treffern.
     */
    SELECT count(*) INTO v_zahl
      FROM public.nachtpruefung_befunde b
     WHERE b.lauf_at = (SELECT max(lauf_at) FROM public.nachtpruefung_befunde)
       AND b.anzahl > 0;
    PERFORM public.kennzahl_schreiben(v_tag, 'OPS', 'nachtpruefung_befunde_offen', v_zahl);
    v_geschrieben := v_geschrieben + 1;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Kennzahl nachtpruefung_befunde_offen uebersprungen: %', SQLERRM;
  END;

  -- ═══════════════════════════════════════════════════════════════════════
  -- VL: Vertriebsleitung
  -- ═══════════════════════════════════════════════════════════════════════
  --
  -- Die sechs Gruppen der Kundenuebersicht, Zeile fuer Zeile uebersetzt aus
  -- src/pages/Statistiken.tsx:317 bis :338. Die Reihenfolge der Abfragen ist
  -- dieselbe wie dort, weil dort jede Zeile mit `return` endet: Ein Kontakt
  -- faellt in die erste Gruppe, auf die er passt, und in keine weitere.
  BEGIN
    -- Verloren geht vor. Archiviert zaehlt mit dazu, sonst faellt der Vorgang
    -- aus der Uebersicht heraus (Begruendung im Kommentar dort).
    SELECT count(*) INTO v_zahl
      FROM public.kontakte k
     WHERE coalesce(k.archiviert, false) = false
       AND coalesce(k.geloescht, false) = false
       AND (public.kennzahl_stufe(k.meta->>'pipelineStufe') IN ('verloren', 'archiviert')
            OR k.status::text = 'verloren');
    PERFORM public.kennzahl_schreiben(v_tag, 'VL', 'verloren', v_zahl);
    v_geschrieben := v_geschrieben + 1;

    -- In Kontakt.
    SELECT count(*) INTO v_zahl
      FROM public.kontakte k
     WHERE coalesce(k.archiviert, false) = false
       AND coalesce(k.geloescht, false) = false
       AND NOT (public.kennzahl_stufe(k.meta->>'pipelineStufe') IN ('verloren', 'archiviert')
                OR k.status::text = 'verloren')
       AND public.kennzahl_stufe(k.meta->>'pipelineStufe') IN (
             'nicht_erreicht', 'erreicht', 'follow_up', 'erstgespraech_geplant', 'eg_noshow');
    PERFORM public.kennzahl_schreiben(v_tag, 'VL', 'in_kontakt', v_zahl);
    v_geschrieben := v_geschrieben + 1;

    -- Qualifiziert.
    SELECT count(*) INTO v_zahl
      FROM public.kontakte k
     WHERE coalesce(k.archiviert, false) = false
       AND coalesce(k.geloescht, false) = false
       AND NOT (public.kennzahl_stufe(k.meta->>'pipelineStufe') IN ('verloren', 'archiviert')
                OR k.status::text = 'verloren')
       AND public.kennzahl_stufe(k.meta->>'pipelineStufe') IN (
             'beratungsgespraech', 'bg_noshow', 'selbstauskunft', 'bonitaetsunterlagen',
             'objektauswahl', 'follow_up_objekt');
    PERFORM public.kennzahl_schreiben(v_tag, 'VL', 'qualifiziert', v_zahl);
    v_geschrieben := v_geschrieben + 1;

    -- In Abwicklung.
    SELECT count(*) INTO v_zahl
      FROM public.kontakte k
     WHERE coalesce(k.archiviert, false) = false
       AND coalesce(k.geloescht, false) = false
       AND NOT (public.kennzahl_stufe(k.meta->>'pipelineStufe') IN ('verloren', 'archiviert')
                OR k.status::text = 'verloren')
       AND public.kennzahl_stufe(k.meta->>'pipelineStufe') IN ('reservierung', 'finanzierung', 'notar');
    PERFORM public.kennzahl_schreiben(v_tag, 'VL', 'in_abwicklung', v_zahl);
    v_geschrieben := v_geschrieben + 1;

    -- Bestandskunden.
    SELECT count(*) INTO v_zahl
      FROM public.kontakte k
     WHERE coalesce(k.archiviert, false) = false
       AND coalesce(k.geloescht, false) = false
       AND NOT (public.kennzahl_stufe(k.meta->>'pipelineStufe') IN ('verloren', 'archiviert')
                OR k.status::text = 'verloren')
       AND public.kennzahl_stufe(k.meta->>'pipelineStufe') IN (
             'faelligkeit', 'abrechnung', 'abgeschlossen', 'bestandsimport');
    PERFORM public.kennzahl_schreiben(v_tag, 'VL', 'bestandskunden', v_zahl);
    v_geschrieben := v_geschrieben + 1;

    /*
     * Neue Leads. In der Oberflaeche ist das die Auffanggruppe: die Stufe
     * "neuer_lead" und alles, was in keine der anderen Gruppen passt
     * (src/pages/Statistiken.tsx:337, Kommentar "Fallback fuer eine unbekannte
     * Stufe"). Deshalb hier als Rest gerechnet und nicht als eigene Liste,
     * sonst liefen die beiden Stellen bei einer neuen Stufe auseinander.
     */
    SELECT count(*) INTO v_zahl
      FROM public.kontakte k
     WHERE coalesce(k.archiviert, false) = false
       AND coalesce(k.geloescht, false) = false
       AND NOT (public.kennzahl_stufe(k.meta->>'pipelineStufe') IN ('verloren', 'archiviert')
                OR k.status::text = 'verloren')
       AND public.kennzahl_stufe(k.meta->>'pipelineStufe') NOT IN (
             'nicht_erreicht', 'erreicht', 'follow_up', 'erstgespraech_geplant', 'eg_noshow',
             'beratungsgespraech', 'bg_noshow', 'selbstauskunft', 'bonitaetsunterlagen',
             'objektauswahl', 'follow_up_objekt',
             'reservierung', 'finanzierung', 'notar',
             'faelligkeit', 'abrechnung', 'abgeschlossen', 'bestandsimport');
    PERFORM public.kennzahl_schreiben(v_tag, 'VL', 'neue_leads', v_zahl);
    v_geschrieben := v_geschrieben + 1;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Bereich VL uebersprungen: %', SQLERRM;
  END;

  -- ═══════════════════════════════════════════════════════════════════════
  -- HR: Bewerbermanagement
  -- ═══════════════════════════════════════════════════════════════════════
  --
  -- Die Tabelle `bewerbungen` traegt auch Stellen und Termine, unterschieden
  -- ueber `meta._type` (src/lib/bewerbungStore.ts:794). Gezaehlt werden nur
  -- die Bewerberzeilen, sonst stuenden Stellenanzeigen in der Bewerberzahl.
  --
  -- Der Status wird wie in src/lib/bewerbungStore.ts:66 (migrateStatus) auf
  -- die heutigen Werte gezogen. Ohne das faellt jeder Altbestand mit
  -- "Screening" oder "Kooperationsgespraech" in die Auffangstufe "Eingang"
  -- und die Zahlen stimmen nicht mit dem Arbeitsplatz ueberein.
  BEGIN
    -- Definitionen: src/components/dashboard/BewerberKpiCard.tsx:19 bis :24.
    SELECT count(*) INTO v_gesamt
      FROM public.bewerbungen b
     WHERE b.meta->>'_type' IS NULL OR b.meta->>'_type' = 'bewerber';
    PERFORM public.kennzahl_schreiben(v_tag, 'HR', 'bewerber_gesamt', v_gesamt);
    v_geschrieben := v_geschrieben + 1;

    SELECT count(*) INTO v_zahl
      FROM public.bewerbungen b
     WHERE (b.meta->>'_type' IS NULL OR b.meta->>'_type' = 'bewerber')
       AND public.kennzahl_bewerberstatus(b.status) = 'Eingang';
    PERFORM public.kennzahl_schreiben(v_tag, 'HR', 'bewerber_eingang', v_zahl);
    v_geschrieben := v_geschrieben + 1;

    SELECT count(*) INTO v_zahl
      FROM public.bewerbungen b
     WHERE (b.meta->>'_type' IS NULL OR b.meta->>'_type' = 'bewerber')
       AND public.kennzahl_bewerberstatus(b.status) NOT IN ('Aktiv', 'Abgelehnt', 'KeinInteresse');
    PERFORM public.kennzahl_schreiben(v_tag, 'HR', 'bewerber_im_prozess', v_zahl);
    v_geschrieben := v_geschrieben + 1;

    SELECT count(*) INTO v_zahl
      FROM public.bewerbungen b
     WHERE (b.meta->>'_type' IS NULL OR b.meta->>'_type' = 'bewerber')
       AND public.kennzahl_bewerberstatus(b.status) = 'Aktiv';
    PERFORM public.kennzahl_schreiben(v_tag, 'HR', 'bewerber_aktiv', v_zahl);
    v_geschrieben := v_geschrieben + 1;

    SELECT count(*) INTO v_zahl
      FROM public.bewerbungen b
     WHERE (b.meta->>'_type' IS NULL OR b.meta->>'_type' = 'bewerber')
       AND public.kennzahl_bewerberstatus(b.status) = 'Abgelehnt';
    PERFORM public.kennzahl_schreiben(v_tag, 'HR', 'bewerber_abgelehnt', v_zahl);
    v_geschrieben := v_geschrieben + 1;

    SELECT count(*) INTO v_zahl
      FROM public.bewerbungen b
     WHERE (b.meta->>'_type' IS NULL OR b.meta->>'_type' = 'bewerber')
       AND public.kennzahl_bewerberstatus(b.status) = 'KeinInteresse';
    PERFORM public.kennzahl_schreiben(v_tag, 'HR', 'bewerber_kein_interesse', v_zahl);
    v_geschrieben := v_geschrieben + 1;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Bereich HR uebersprungen: %', SQLERRM;
  END;

  -- ═══════════════════════════════════════════════════════════════════════
  -- MKT: Social Media und Marketing
  -- ═══════════════════════════════════════════════════════════════════════
  --
  -- Bewusst duenn. Der Trichter des Analysetools und des Steuerrechners waere
  -- die eigentliche Marketingzahl, aber `analysetool_ereignisse` ist in der
  -- Datenbank noch nicht angelegt (supabase/migrations-inbox/README.md,
  -- Punkt 3). Solange dort nichts ankommt, waere jede Trichterzahl eine Null,
  -- die wie ein Messwert aussieht.
  BEGIN
    /*
     * Leads aus Formular oder manueller Anlage. Gruppierung wortgleich aus
     * src/pages/Statistiken.tsx:573 (`isFormularManuell`): leere Quelle zaehlt
     * dazu, ebenso die sechs genannten Schreibweisen, verglichen wird in
     * Kleinschreibung ohne Rand-Leerzeichen.
     */
    SELECT count(*) INTO v_zahl
      FROM public.kontakte k
     WHERE coalesce(k.archiviert, false) = false
       AND coalesce(k.geloescht, false) = false
       AND (
         btrim(lower(coalesce(k.quelle, ''))) = ''
         OR btrim(lower(k.quelle)) IN (
              'unbekannt', 'manuell', 'formular', 'website-formular',
              'lead-formular', 'kontaktformular')
       );
    PERFORM public.kennzahl_schreiben(v_tag, 'MKT', 'leads_quelle_formular_manuell', v_zahl);
    v_geschrieben := v_geschrieben + 1;

    -- Alles Uebrige, also die benannten Plattformen und Kanaele.
    SELECT count(*) INTO v_zahl
      FROM public.kontakte k
     WHERE coalesce(k.archiviert, false) = false
       AND coalesce(k.geloescht, false) = false
       AND btrim(lower(coalesce(k.quelle, ''))) <> ''
       AND btrim(lower(k.quelle)) NOT IN (
             'unbekannt', 'manuell', 'formular', 'website-formular',
             'lead-formular', 'kontaktformular');
    PERFORM public.kennzahl_schreiben(v_tag, 'MKT', 'leads_quelle_plattform', v_zahl);
    v_geschrieben := v_geschrieben + 1;

    /*
     * Leads mit einer Kampagnenkennung. `meta.kampagne` ist ein Objekt mit den
     * sieben Feldern aus src/lib/kampagnenKennung.ts:79. Als "vorhanden" gilt
     * es, wenn mindestens eines davon gefuellt ist; das ist die Bedingung aus
     * `istLeer` (src/lib/kampagnenKennung.ts:98), die auch
     * `kampagneAusKontakt` (:230) anwendet.
     */
    SELECT count(*) INTO v_zahl
      FROM public.kontakte k
     WHERE coalesce(k.archiviert, false) = false
       AND coalesce(k.geloescht, false) = false
       AND jsonb_typeof(k.meta->'kampagne') = 'object'
       AND (
         coalesce(k.meta->'kampagne'->>'utmSource', '')   <> ''
         OR coalesce(k.meta->'kampagne'->>'utmMedium', '')   <> ''
         OR coalesce(k.meta->'kampagne'->>'utmCampaign', '') <> ''
         OR coalesce(k.meta->'kampagne'->>'utmContent', '')  <> ''
         OR coalesce(k.meta->'kampagne'->>'utmTerm', '')     <> ''
         OR coalesce(k.meta->'kampagne'->>'gclid', '')       <> ''
         OR coalesce(k.meta->'kampagne'->>'fbclid', '')      <> ''
       );
    PERFORM public.kennzahl_schreiben(v_tag, 'MKT', 'leads_mit_kampagne', v_zahl);
    v_geschrieben := v_geschrieben + 1;

    /*
     * Leads mit ausgeschriebenem Kampagnennamen. `utm_campaign` ist die Ebene,
     * auf der Budget verteilt wird; die Auswertung gruppiert genau danach
     * (src/lib/kampagnenKennung.ts:212, benutzt in
     * src/components/statistiken/StatistikConversion.tsx:149).
     */
    SELECT count(*) INTO v_zahl
      FROM public.kontakte k
     WHERE coalesce(k.archiviert, false) = false
       AND coalesce(k.geloescht, false) = false
       AND jsonb_typeof(k.meta->'kampagne') = 'object'
       AND coalesce(k.meta->'kampagne'->>'utmCampaign', '') <> '';
    PERFORM public.kennzahl_schreiben(v_tag, 'MKT', 'leads_mit_utm_campaign', v_zahl);
    v_geschrieben := v_geschrieben + 1;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Bereich MKT uebersprungen: %', SQLERRM;
  END;

  -- ═══════════════════════════════════════════════════════════════════════
  -- OBJ: Objektmanagement
  -- ═══════════════════════════════════════════════════════════════════════
  --
  -- Definitionen aus src/components/dashboard/ObjektpartnerDashboard.tsx:20
  -- bis :31. Die Statusumschrift der Einheiten steht in
  -- src/lib/objekteStore.ts:426: "gesetzt" zaehlt als reserviert, alles, was
  -- weder reserviert noch verkauft ist, zaehlt als frei.
  --
  -- Volumen und Durchschnittsrendite waeren ebenfalls nachbaubar, bleiben aber
  -- draussen: Sie haengen an `vk_gesamt` und `rendite` je Einheit, und wie gut
  -- diese beiden Felder gepflegt sind, schwankt. Eine Zahl, die springt, weil
  -- jemand ein Feld nachtraegt, erzaehlt vom Pflegestand und nicht vom
  -- Geschaeft.
  BEGIN
    SELECT count(*) INTO v_zahl FROM public.objekte;
    PERFORM public.kennzahl_schreiben(v_tag, 'OBJ', 'objekte_gesamt', v_zahl);
    v_geschrieben := v_geschrieben + 1;

    SELECT count(*) INTO v_zahl FROM public.objekte o WHERE coalesce(o.sichtbar, false) = true;
    PERFORM public.kennzahl_schreiben(v_tag, 'OBJ', 'objekte_sichtbar', v_zahl);
    v_geschrieben := v_geschrieben + 1;

    SELECT count(*) INTO v_zahl FROM public.wohnungen;
    PERFORM public.kennzahl_schreiben(v_tag, 'OBJ', 'wohneinheiten_gesamt', v_zahl);
    v_geschrieben := v_geschrieben + 1;

    SELECT count(*) INTO v_zahl
      FROM public.wohnungen w
     WHERE lower(coalesce(w.status, '')) NOT IN ('reserviert', 'gesetzt', 'verkauft');
    PERFORM public.kennzahl_schreiben(v_tag, 'OBJ', 'wohneinheiten_frei', v_zahl);
    v_geschrieben := v_geschrieben + 1;

    SELECT count(*) INTO v_zahl
      FROM public.wohnungen w
     WHERE lower(coalesce(w.status, '')) IN ('reserviert', 'gesetzt');
    PERFORM public.kennzahl_schreiben(v_tag, 'OBJ', 'wohneinheiten_reserviert', v_zahl);
    v_geschrieben := v_geschrieben + 1;

    SELECT count(*) INTO v_zahl
      FROM public.wohnungen w
     WHERE lower(coalesce(w.status, '')) = 'verkauft';
    PERFORM public.kennzahl_schreiben(v_tag, 'OBJ', 'wohneinheiten_verkauft', v_zahl);
    v_geschrieben := v_geschrieben + 1;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Bereich OBJ uebersprungen: %', SQLERRM;
  END;

  -- ═══════════════════════════════════════════════════════════════════════
  -- BO: Backoffice und Support
  -- ═══════════════════════════════════════════════════════════════════════
  --
  -- Definitionen aus src/lib/supportTicketStore.ts:252 (getTicketStats),
  -- angezeigt in src/components/dashboard/HelpdeskCard.tsx:19.
  --
  -- Antwortzeit, Loesungszeit und Zufriedenheit stehen dort ausdruecklich auf
  -- einem Strich beziehungsweise auf null, weil sie nicht erfasst werden
  -- (src/lib/supportTicketStore.ts:260). Was nicht gemessen wird, kann auch
  -- kein Verlauf mitschreiben.
  BEGIN
    SELECT count(*) INTO v_zahl FROM public.support_tickets;
    PERFORM public.kennzahl_schreiben(v_tag, 'BO', 'tickets_gesamt', v_zahl);
    v_geschrieben := v_geschrieben + 1;

    SELECT count(*) INTO v_zahl FROM public.support_tickets t WHERE t.status = 'neu';
    PERFORM public.kennzahl_schreiben(v_tag, 'BO', 'tickets_neu', v_zahl);
    v_geschrieben := v_geschrieben + 1;

    SELECT count(*) INTO v_zahl FROM public.support_tickets t WHERE t.status = 'offen';
    PERFORM public.kennzahl_schreiben(v_tag, 'BO', 'tickets_offen', v_zahl);
    v_geschrieben := v_geschrieben + 1;

    SELECT count(*) INTO v_zahl FROM public.support_tickets t WHERE t.status = 'in_bearbeitung';
    PERFORM public.kennzahl_schreiben(v_tag, 'BO', 'tickets_in_bearbeitung', v_zahl);
    v_geschrieben := v_geschrieben + 1;

    -- "Erledigt" ist auf der Karte die Summe aus geloest und geschlossen
    -- (src/components/dashboard/HelpdeskCard.tsx:33).
    SELECT count(*) INTO v_zahl
      FROM public.support_tickets t WHERE t.status IN ('geloest', 'geschlossen');
    PERFORM public.kennzahl_schreiben(v_tag, 'BO', 'tickets_erledigt', v_zahl);
    v_geschrieben := v_geschrieben + 1;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Bereich BO uebersprungen: %', SQLERRM;
  END;

  -- ═══════════════════════════════════════════════════════════════════════
  -- FIN: Finanzierung
  -- ═══════════════════════════════════════════════════════════════════════
  --
  -- Die Kennzahlen des Finanzierungsblocks selbst (Tage von der
  -- Reservierungsvereinbarung bis zum Angebot und weiter) bleiben draussen:
  -- Sie rechnen mit Datumsfeldern tief in `investments.meta` und kappen
  -- Ausreisser bei 365 Tagen
  -- (src/components/dashboard/FinanzierungsPerformanceBlock.tsx:99 bis :121).
  -- Diese Kette in SQL nachzubauen hiesse, sie ein zweites Mal zu schreiben.
  BEGIN
    -- Offene Reservierungen: unterschrieben, aber noch nicht beim Notar
    -- (src/lib/dashboardKpis.ts:113, Menge OFFENE_RESERVIERUNG). Hier wird
    -- bewusst die rohe Stufe kleingeschrieben verglichen, genau wie dort
    -- (src/lib/dashboardKpis.ts:200).
    SELECT count(*) INTO v_zahl
      FROM public.kontakte k
     WHERE coalesce(k.archiviert, false) = false
       AND coalesce(k.geloescht, false) = false
       AND lower(coalesce(k.meta->>'pipelineStufe', '')) IN ('reservierung', 'finanzierung');
    PERFORM public.kennzahl_schreiben(v_tag, 'FIN', 'reservierungen_offen', v_zahl);
    v_geschrieben := v_geschrieben + 1;

    -- Kunden, bei denen gerade die Bonitaetsunterlagen laufen. Die Stufe steht
    -- seit dem 06.08.2026 hinter der Reservierung
    -- (src/lib/pipelineStufen.ts:56 und die Begruendung bei den
    -- Wahrscheinlichkeiten, :96).
    SELECT count(*) INTO v_zahl
      FROM public.kontakte k
     WHERE coalesce(k.archiviert, false) = false
       AND coalesce(k.geloescht, false) = false
       AND lower(coalesce(k.meta->>'pipelineStufe', '')) = 'bonitaetsunterlagen';
    PERFORM public.kennzahl_schreiben(v_tag, 'FIN', 'bonitaetsunterlagen', v_zahl);
    v_geschrieben := v_geschrieben + 1;

    -- Beim Notar (src/lib/abschlussDefinition.ts:17, erste Stufe der
    -- Abschlussdefinition).
    SELECT count(*) INTO v_zahl
      FROM public.kontakte k
     WHERE coalesce(k.archiviert, false) = false
       AND coalesce(k.geloescht, false) = false
       AND lower(coalesce(k.meta->>'pipelineStufe', '')) = 'notar';
    PERFORM public.kennzahl_schreiben(v_tag, 'FIN', 'notar', v_zahl);
    v_geschrieben := v_geschrieben + 1;

    -- Unterschriften, auf die noch gewartet wird. `pending` ist der Zustand
    -- einer offenen Anfrage
    -- (supabase/migrations/20260314155343_...sql:65, so gelesen auch in der
    -- Nachtpruefung, 20260807130000_nachtpruefung_pool_drei_tage.sql:52).
    SELECT count(*) INTO v_zahl
      FROM public.signature_requests s
     WHERE s.status = 'pending' AND s.expires_at > now();
    PERFORM public.kennzahl_schreiben(v_tag, 'FIN', 'signaturen_offen', v_zahl);
    v_geschrieben := v_geschrieben + 1;

    -- Abgelaufene Unterschriften. Praedikat wortgleich aus der Nachtpruefung
    -- (supabase/migrations/20260805100000_nachtpruefung.sql:214), samt der
    -- dortigen Begrenzung auf die letzten 30 Tage.
    SELECT count(*) INTO v_zahl
      FROM public.signature_requests s
     WHERE s.status = 'pending'
       AND s.expires_at < now()
       AND s.expires_at > now() - interval '30 days';
    PERFORM public.kennzahl_schreiben(v_tag, 'FIN', 'signaturen_abgelaufen', v_zahl);
    v_geschrieben := v_geschrieben + 1;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Bereich FIN uebersprungen: %', SQLERRM;
  END;

  -- ═══════════════════════════════════════════════════════════════════════
  -- AS: Aftersales und Bestandskundenbetreuung
  -- ═══════════════════════════════════════════════════════════════════════
  --
  -- Die Empfehlungsquote selbst (src/lib/statistikenHelper.ts:389) bleibt
  -- draussen: Sie ordnet eine Empfehlung ueber einen Namensvergleich auf dem
  -- Freitextfeld `empfohlen_von` einem Bestandskunden zu, und der Code nennt
  -- das an Ort und Stelle fragil. Gezaehlt werden deshalb die Empfehlungen
  -- selbst, und die Quote kann sich jeder daraus bilden, der weiss, worauf er
  -- sie bezieht.
  BEGIN
    SELECT count(*) INTO v_zahl FROM public.empfehlungen;
    PERFORM public.kennzahl_schreiben(v_tag, 'AS', 'empfehlungen_gesamt', v_zahl);
    v_geschrieben := v_geschrieben + 1;

    -- Frisch eingegangen, noch nicht angefasst (src/pages/Empfehlungen.tsx:175).
    SELECT count(*) INTO v_zahl FROM public.empfehlungen e WHERE coalesce(e.status, 'offen') = 'neu';
    PERFORM public.kennzahl_schreiben(v_tag, 'AS', 'empfehlungen_neu', v_zahl);
    v_geschrieben := v_geschrieben + 1;

    -- Zum Abschluss gekommen (src/pages/Empfehlungen.tsx:223).
    SELECT count(*) INTO v_zahl FROM public.empfehlungen e WHERE e.status = 'abgeschlossen';
    PERFORM public.kennzahl_schreiben(v_tag, 'AS', 'empfehlungen_abgeschlossen', v_zahl);
    v_geschrieben := v_geschrieben + 1;

    SELECT count(*) INTO v_zahl FROM public.tippgeber;
    PERFORM public.kennzahl_schreiben(v_tag, 'AS', 'tippgeber_gesamt', v_zahl);
    v_geschrieben := v_geschrieben + 1;

    -- Abgegebene Partnerbewertungen (src/pages/VpBewertungen.tsx:54 rechnet
    -- den Mittelwert ueber genau diese Zeilen).
    SELECT count(*) INTO v_zahl FROM public.vp_bewertungen;
    PERFORM public.kennzahl_schreiben(v_tag, 'AS', 'vp_bewertungen_gesamt', v_zahl);
    v_geschrieben := v_geschrieben + 1;

    -- Kundenbewertungen (src/lib/statistikenHelper.ts:403).
    SELECT count(*) INTO v_zahl FROM public.kunden_bewertungen;
    PERFORM public.kennzahl_schreiben(v_tag, 'AS', 'kunden_bewertungen_gesamt', v_zahl);
    v_geschrieben := v_geschrieben + 1;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Bereich AS uebersprungen: %', SQLERRM;
  END;

  -- ═══════════════════════════════════════════════════════════════════════
  -- VA: Vertriebsakademie
  -- ═══════════════════════════════════════════════════════════════════════
  --
  -- Definitionen aus der Leitungsansicht
  -- (src/pages/vertriebsakademie/VertriebsakademieAdmin.tsx:76 bis :105).
  --
  -- XP, Level und Abzeichen bleiben draussen: Sie werden im Browser aus einem
  -- JSON-Feld gerechnet (src/lib/vertriebsakademieProgress.ts:653 und
  -- folgende), nicht in der Datenbank. Der Fortschritt der Wissenswelt
  -- ebenfalls, er liegt allein im `localStorage` des jeweiligen Browsers
  -- (src/lib/wissensweltProgress.ts:1).
  BEGIN
    SELECT count(DISTINCT f.user_id) INTO v_zahl FROM public.va_partner_fortschritt f;
    PERFORM public.kennzahl_schreiben(v_tag, 'VA', 'partner_mit_fortschritt', v_zahl);
    v_geschrieben := v_geschrieben + 1;

    SELECT count(*) INTO v_zahl
      FROM public.va_partner_fortschritt f WHERE f.kapitel_abgeschlossen = true;
    PERFORM public.kennzahl_schreiben(v_tag, 'VA', 'kapitel_abgeschlossen', v_zahl);
    v_geschrieben := v_geschrieben + 1;

    SELECT count(*) INTO v_zahl
      FROM public.va_aufgaben_ergebnisse a WHERE a.geloest = true;
    PERFORM public.kennzahl_schreiben(v_tag, 'VA', 'aufgaben_geloest', v_zahl);
    v_geschrieben := v_geschrieben + 1;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Bereich VA uebersprungen: %', SQLERRM;
  END;

  -- ═══════════════════════════════════════════════════════════════════════
  -- CTR: Controlling und Buchhaltung
  -- ═══════════════════════════════════════════════════════════════════════
  --
  -- Nur die Abrechnungslaeufe. Eine Aufwandsseite gibt es im System nicht:
  -- keine Kostenarten, keine Eingangsrechnungen, kein Deckungsbeitrag. Die
  -- Tabellen `rechnungen` und `rechnung_stammdaten` existieren zwar, werden
  -- aber von keinem Anwendungscode beschrieben, der Rechnungsgenerator legt
  -- seine Daten im `localStorage` ab
  -- (src/components/unterlagen/RechnungsGeneratorDialog.tsx:124).
  --
  -- Die Summen der Abrechnung (netto, eigen, Overhead) bleiben ebenfalls
  -- draussen. Sie haengen am Provisionssatz je Deal, und der wird an mehreren
  -- Stellen ermittelt (src/lib/karriereStufeHelper.ts:136 und :216).
  BEGIN
    SELECT count(*) INTO v_zahl FROM public.provisionsabrechnungen;
    PERFORM public.kennzahl_schreiben(v_tag, 'CTR', 'abrechnungen_gesamt', v_zahl);
    v_geschrieben := v_geschrieben + 1;

    -- Die drei Zustaende sind in der Tabelle selbst festgeschrieben
    -- (supabase/migrations/20260729080000_abrechnung_sichtbar_und_dauerhaft.sql:38),
    -- gelesen in src/lib/provisionsAbrechnungStore.ts:103.
    SELECT count(*) INTO v_zahl FROM public.provisionsabrechnungen a WHERE a.status = 'offen';
    PERFORM public.kennzahl_schreiben(v_tag, 'CTR', 'abrechnungen_offen', v_zahl);
    v_geschrieben := v_geschrieben + 1;

    SELECT count(*) INTO v_zahl FROM public.provisionsabrechnungen a WHERE a.status = 'freigegeben';
    PERFORM public.kennzahl_schreiben(v_tag, 'CTR', 'abrechnungen_freigegeben', v_zahl);
    v_geschrieben := v_geschrieben + 1;

    SELECT count(*) INTO v_zahl FROM public.provisionsabrechnungen a WHERE a.status = 'ausgezahlt';
    PERFORM public.kennzahl_schreiben(v_tag, 'CTR', 'abrechnungen_ausgezahlt', v_zahl);
    v_geschrieben := v_geschrieben + 1;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Bereich CTR uebersprungen: %', SQLERRM;
  END;

  RETURN v_geschrieben;
END;
$$;

REVOKE ALL ON FUNCTION public.kennzahlen_tagesstand_lauf() FROM anon, authenticated;

COMMENT ON FUNCTION public.kennzahlen_tagesstand_lauf() IS
  'Schreibt den Tagesstand der Kennzahlen je Bereich. Wird naechtlich von '
  'pg_cron gerufen. Ein zweiter Lauf am selben Tag ersetzt die Werte. Jeder '
  'Bereich hat seinen eigenen Fehlerabfang, ein Ausfall reisst die uebrigen '
  'nicht mit.';

-- ---------------------------------------------------------------------------
-- 4) Die Lesefunktion
-- ---------------------------------------------------------------------------
--
-- Liefert je Kennzahl den heutigen Stand und den Stand vor sieben Tagen in
-- einer Zeile, damit die Oberflaeche und spaeter der Lagebericht nur einmal
-- fragen muessen.
--
-- Gesucht wird nicht der Wert von genau heute, sondern der letzte Wert bis
-- heute. Sonst stuende die Seite leer da, solange der Nachtlauf noch nicht
-- gelaufen ist oder einmal ausgefallen war. Fuer die Vorwoche gilt dasselbe:
-- der letzte Wert bis einschliesslich vor sieben Tagen.
--
-- Bewusst OHNE `SECURITY DEFINER`: So gilt die Zeilensicherheit der Tabelle,
-- und es sieht genau der etwas, der die Tabelle auch direkt lesen duerfte.

CREATE OR REPLACE FUNCTION public.kennzahlen_verlauf(p_bereich text DEFAULT NULL)
RETURNS TABLE(
  bereich text,
  kennzahl text,
  stichtag_heute date,
  wert_heute numeric,
  stichtag_vorwoche date,
  wert_vorwoche numeric,
  veraenderung numeric
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH heute AS (
    SELECT DISTINCT ON (k.bereich, k.kennzahl)
           k.bereich AS b, k.kennzahl AS n, k.stichtag AS tag, k.wert AS w
      FROM public.kennzahlen_tagesstand k
     WHERE (p_bereich IS NULL OR k.bereich = p_bereich)
       AND k.stichtag <= (now() AT TIME ZONE 'Europe/Berlin')::date
     ORDER BY k.bereich, k.kennzahl, k.stichtag DESC
  ),
  vorwoche AS (
    SELECT DISTINCT ON (k.bereich, k.kennzahl)
           k.bereich AS b, k.kennzahl AS n, k.stichtag AS tag, k.wert AS w
      FROM public.kennzahlen_tagesstand k
     WHERE (p_bereich IS NULL OR k.bereich = p_bereich)
       AND k.stichtag <= (now() AT TIME ZONE 'Europe/Berlin')::date - 7
     ORDER BY k.bereich, k.kennzahl, k.stichtag DESC
  )
  SELECT h.b, h.n, h.tag, h.w, v.tag, v.w,
         CASE WHEN v.w IS NULL THEN NULL ELSE h.w - v.w END
    FROM heute h
    LEFT JOIN vorwoche v ON v.b = h.b AND v.n = h.n
   ORDER BY h.b, h.n;
$$;

GRANT EXECUTE ON FUNCTION public.kennzahlen_verlauf(text) TO authenticated;
REVOKE ALL ON FUNCTION public.kennzahlen_verlauf(text) FROM anon;

COMMENT ON FUNCTION public.kennzahlen_verlauf(text) IS
  'Je Kennzahl der letzte Stand bis heute und der letzte Stand bis vor sieben '
  'Tagen, dazu die Veraenderung. Ohne Parameter alle Bereiche. Laeuft mit den '
  'Rechten des Aufrufers, es gilt also die Zeilensicherheit der Tabelle.';

-- ---------------------------------------------------------------------------
-- 5) Der Zeitplan
-- ---------------------------------------------------------------------------
--
-- 04:10 UTC, also 06:10 deutscher Sommerzeit und 05:10 im Winter.
--
-- Warum genau dort: Der Platz muss nach allem liegen, was die Zahlen ueber
-- Nacht noch veraendert, und vor dem ersten Arbeitsbeginn. Belegt sind
-- 02:30 (Investagon-Abgleich), 03:00 (Nachtpruefung), 03:15 (Audit-Log und
-- Aktivitaetsprotokoll), 03:30 (Mailprotokoll), 03:45 (abgelaufene Token),
-- 04:00 sonntags (Videoraeume), 04:30 (Morgenmail der Nachtpruefung) und ab
-- 05:00 die Eskalationsdienste. 04:10 liegt in der Luecke dazwischen: die
-- naechtlichen Aufraeumlaeufe sind durch, die Morgenmail noch nicht raus, und
-- kein Mensch arbeitet.
--
-- Fest auf UTC gesetzt wie alle uebrigen Zeitplaene dieses Projekts. Eine
-- Umschaltung auf Sommerzeit waere mehr Aufwand als Nutzen.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'kennzahlen-tagesstand') THEN
      PERFORM cron.unschedule('kennzahlen-tagesstand');
    END IF;
    PERFORM cron.schedule(
      'kennzahlen-tagesstand',
      '10 4 * * *',
      'SELECT public.kennzahlen_tagesstand_lauf();'
    );
  ELSE
    RAISE NOTICE 'pg_cron ist nicht installiert, der Zeitplan wurde nicht gesetzt.';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Zeitplan fuer den Kennzahlen-Tagesstand nicht gesetzt: %. Bitte von Hand anlegen.', SQLERRM;
END $$;

-- Einmal sofort laufen lassen. Dann liegt gleich ein erster Stichtag vor, und
-- es zeigt sich noch im SQL-Editor, ob alle Bereiche mit dem echten Schema
-- zurechtkommen: Ein uebersprungener Bereich meldet sich als NOTICE.
SELECT public.kennzahlen_tagesstand_lauf();
