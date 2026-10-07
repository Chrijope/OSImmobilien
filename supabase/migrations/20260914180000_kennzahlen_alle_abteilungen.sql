-- ===========================================================================
-- Kennzahlen fuer die uebrigen Abteilungen: der Nachtlauf bekommt einen
-- zweiten Teil
-- ===========================================================================
--
-- WOZU DAS DA IST
--
-- Seit dem 08.09.2026 schreibt `kennzahlen_tagesstand_lauf()` jede Nacht 56
-- Zahlen aus elf Bereichen. Die vierzehn digitalen Abteilungen haben zusammen
-- rund sechzig Kacheln, und davon liest bisher ein Dutzend eine echte Zahl.
-- Drei Bereiche kommen im Lauf gar nicht vor: TEC, REC und ST.
--
-- Diese Migration ergaenzt 25 Kennzahlen. Jede von ihnen hat ueber sich einen
-- Kommentar, der sagt, was sie zaehlt und aus welcher Stelle im Projekt ihre
-- Rechnung stammt. Wo eine Zahl neu definiert wird, weil es sie im CRM noch
-- nicht gibt, steht das ausdruecklich dabei.
--
-- WARUM EIN ZWEITER LAUF UND KEINE ERWEITERUNG DES ERSTEN
--
-- `kennzahlen_tagesstand_lauf()` ist rund tausend Zeilen lang. Sie hier
-- vollstaendig abzuschreiben, nur um fuenfundzwanzig Bloecke anzuhaengen,
-- hiesse tausend Zeilen ungeprueft zu kopieren; ein Tippfehler darin faellt
-- erst nachts um zehn nach vier auf. Stattdessen steht hier eine zweite
-- Funktion `kennzahlen_tagesstand_zusatz()` mit demselben Aufbau, und der
-- naechtliche Zeitplan ruft beide nacheinander.
--
-- Das hat einen sichtbaren Preis: Wer `SELECT kennzahlen_tagesstand_lauf();`
-- von Hand ausfuehrt, bekommt nur die 56 alten Zahlen. Die neuen kommen erst
-- mit dem zweiten Aufruf. Das ist bewusst so gewaehlt und nicht versteckt:
-- Lieber zwei ehrlich benannte Funktionen als eine, in der die Haelfte
-- abgeschrieben ist. Wer die beiden spaeter zusammenlegen will, kann das in
-- einer eigenen Migration tun; der Zeitplan unten ist dann die einzige
-- Stelle, die sich aendert.
--
-- WAS BEWUSST NICHT DRIN STEHT
--
--   * Alles, was nur im Browser gerechnet wird und nirgends gespeichert ist:
--     der Vorab-Score der Bewerber (src/lib/bewerberVorabScore.ts, 852 Zeilen
--     Punktlogik), der Wissenswelt-Fortschritt, die Rechnungsnummern.
--   * Alles, was ausserhalb der Datenbank liegt: offene Migrationen (der
--     Eingangskorb ist ein Ordner), gruene Tests (eine Datei unter
--     `.nachtwaechter/`), Entwurfsseiten (eine Liste in
--     src/lib/draftRoutes.ts), Kapitel und Einwaende der Vertriebsakademie
--     (Konstanten in src/lib/vertriebsakademieContent.ts).
--   * Alles Textliche. In `kennzahlen_tagesstand.wert` steht ein `numeric`.
--     "Beste Kampagne" und "Fall der Woche" sind Namen, keine Zahlen, und
--     passen deshalb grundsaetzlich nicht in diese Tabelle.
--   * Die Genehmigungsquote der Banken. Es gibt im ganzen System keine
--     bankseitige Zu- oder Absage; `investments.meta.finanzierungsStatus`
--     kennt zwar den Wert "abgelehnt", aber kein Code schreibt ihn jemals.
--     src/pages/Statistiken.tsx sagt das an Ort und Stelle: "keine
--     Bank-Genehmigungsquote". Was es gibt, ist der Uebergang von der
--     Finanzierung zum Notar, und der steht unten unter seinem eigenen,
--     ehrlichen Namen.
--   * Die Dauer bis zur Zusage. Sie haengt an
--     `meta.finanzierungAngebotGesendetAm` und
--     `meta.darlehensvertragUploadedAm`, und diese beiden Stempel setzt nur
--     der Eigenfinanzierungs-Pfad (src/lib/eigenfinanzierungStore.ts:88). Der
--     regulaere Weg ueber die Finanzierungskarte setzt sie nicht. Eine
--     Durchschnittsdauer aus einer Handvoll Sonderfaelle sieht aus wie eine
--     Messung und ist keine.
--
-- ALLE ZAHLEN SIND ANZAHLEN, SUMMEN ODER QUOTEN. Kein Name, keine Kennung,
-- kein Einzelbetrag eines Kunden.
--
-- Mehrfach ausfuehrbar. Ein zweiter Lauf am selben Tag ersetzt die Werte des
-- Tages, statt sie zu verdoppeln.
--
-- UNGETESTET: Diese Datei ist in keiner Datenbank gelaufen. Sie wurde ohne
-- Datenbankzugang geschrieben und nur auf Syntax geprueft. Ein Block, der auf
-- das echte Schema nicht passt, meldet sich beim ersten Lauf als NOTICE und
-- reisst die uebrigen nicht mit.

-- ---------------------------------------------------------------------------
-- 1) Drei Bereiche mehr
-- ---------------------------------------------------------------------------
--
-- Die Bereichsliste ist eine feste Aufzaehlung, damit ein Tippfehler eine
-- Kennzahl nicht still aus jeder Auswertung fallen laesst. TEC und ST bekommen
-- unten Zahlen, REC steht mit in der Liste, damit eine spaetere Kennzahl der
-- Rechtsabteilung keine zweite Schemaaenderung braucht.

ALTER TABLE public.kennzahlen_tagesstand
  DROP CONSTRAINT IF EXISTS kennzahlen_tagesstand_bereich_chk;

ALTER TABLE public.kennzahlen_tagesstand
  ADD CONSTRAINT kennzahlen_tagesstand_bereich_chk CHECK (bereich IN (
    'AGL', 'OPS', 'VL', 'TEC', 'REC', 'HR', 'VA', 'ST',
    'MKT', 'OBJ', 'BO', 'FIN', 'AS', 'CTR'
  ));

-- ---------------------------------------------------------------------------
-- 2) Fuenf Helfer
-- ---------------------------------------------------------------------------

/*
 * Eine Zahl aus einem Textfeld, ohne dass ein Schreibfehler die ganze
 * Kennzahl zerreisst.
 *
 * In `meta` steht vieles als Text, und ein einziges "ca. 250000" wuerde einen
 * Cast auf numeric abbrechen lassen. JavaScript liefert dort `NaN` und rechnet
 * mit 0 weiter (siehe `amount` in src/lib/statistikController.ts:48); hier
 * kommt NULL zurueck, und der Aufrufer entscheidet.
 */
CREATE OR REPLACE FUNCTION public.kennzahl_zahl(_roh text)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF _roh IS NULL OR btrim(_roh) = '' THEN
    RETURN NULL;
  END IF;
  RETURN btrim(_roh)::numeric;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.kennzahl_zahl(text) IS
  'Zahl aus einem Textfeld, NULL statt Fehler bei allem Unlesbaren. '
  'Entsprechung von amount() in src/lib/statistikController.ts:48.';

/*
 * Ein Datum aus einem Textfeld, in beiden Schreibweisen.
 *
 * Datumsangaben liegen in diesem Projekt mal als ISO und mal als TT.MM.JJJJ
 * vor, oft in derselben Spalte. Die Anwendung liest beides
 * (`alsDatumsString` in src/lib/faelligkeit.ts:21 und `leseDatum` in
 * src/lib/dashboardKpis.ts:126), die Edge Functions ebenfalls
 * (`berlinerZeitNachUtc` in supabase/functions/_shared/notar-zeitpunkt.ts:56).
 * Wer hier blind nach `date` castet, verliert jeden Vorgang mit deutschem
 * Datum, und zwar still.
 */
CREATE OR REPLACE FUNCTION public.kennzahl_datum(_roh text)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  t text := btrim(coalesce(_roh, ''));
BEGIN
  IF t = '' THEN
    RETURN NULL;
  END IF;
  IF t ~ '^\d{4}-\d{2}-\d{2}' THEN
    RETURN substring(t from 1 for 10)::date;
  END IF;
  IF t ~ '^\d{1,2}\.\d{1,2}\.\d{4}' THEN
    RETURN to_date(substring(t from '^(\d{1,2}\.\d{1,2}\.\d{4})'), 'DD.MM.YYYY');
  END IF;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.kennzahl_datum(text) IS
  'Datum aus ISO oder TT.MM.JJJJ, NULL bei allem anderen. Entsprechung von '
  'alsDatumsString (src/lib/faelligkeit.ts:21) und leseDatum '
  '(src/lib/dashboardKpis.ts:126).';

/*
 * Abschlusswahrscheinlichkeit einer Pipelinestufe.
 *
 * Wortgetreue Kopie von `STUFEN_WAHRSCHEINLICHKEIT` aus
 * src/lib/pipelineStufen.ts:83. WER DORT EINE ZAHL AENDERT, MUSS SIE HIER
 * MITAENDERN. Es gibt dafuer keinen Test, anders als bei den
 * Untaetigkeitsschwellen, die `src/lib/pipelineSchwellen.test.ts` Zeile fuer
 * Zeile vergleicht.
 *
 * Unterschied zur Anwendung: `wahrscheinlichkeitFuerStufe`
 * (src/lib/pipelineStufen.ts:130) faellt bei einer unbekannten Stufe auf 0,1
 * zurueck. Hier kommt NULL zurueck, weil der einzige Aufrufer weiter unten
 * die Trichterrechnung ist, und die stellt eine unbekannte Stufe in die
 * Zeile "Stufe ungeklaert" mit dem Gewicht null
 * (src/lib/statistikController.ts:252). Mit 0,1 statt 0 stuende in der
 * Hochrechnung Geld, das keiner Stufe zugeordnet ist.
 */
CREATE OR REPLACE FUNCTION public.kennzahl_wahrscheinlichkeit(_stufe text)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE _stufe
    WHEN 'neuer_lead'            THEN 0.05
    WHEN 'nicht_erreicht'        THEN 0.03
    WHEN 'erreicht'              THEN 0.08
    WHEN 'follow_up'             THEN 0.10
    WHEN 'erstgespraech_geplant' THEN 0.15
    WHEN 'eg_noshow'             THEN 0.08
    WHEN 'beratungsgespraech'    THEN 0.30
    WHEN 'bg_noshow'             THEN 0.12
    WHEN 'selbstauskunft'        THEN 0.32
    WHEN 'objektauswahl'         THEN 0.42
    WHEN 'follow_up_objekt'      THEN 0.45
    WHEN 'reservierung'          THEN 0.60
    WHEN 'bonitaetsunterlagen'   THEN 0.75
    WHEN 'finanzierung'          THEN 0.80
    WHEN 'notar'                 THEN 0.90
    WHEN 'faelligkeit'           THEN 1.00
    WHEN 'abrechnung'            THEN 1.00
    WHEN 'abgeschlossen'         THEN 1.00
    WHEN 'bestandsimport'        THEN 0.00
    WHEN 'archiviert'            THEN 0.00
    WHEN 'verloren'              THEN 0.00
    WHEN 'erstgespraech'         THEN 0.15
    WHEN 'zugewiesen'            THEN 0.05
    WHEN 'kontaktversuche'       THEN 0.08
    WHEN 'vermoegensaufbau'      THEN 0.12
    WHEN 'closing'               THEN 0.45
    ELSE NULL
  END;
$$;

COMMENT ON FUNCTION public.kennzahl_wahrscheinlichkeit(text) IS
  'Abschlusswahrscheinlichkeit je Stufe, Kopie von STUFEN_WAHRSCHEINLICHKEIT '
  'in src/lib/pipelineStufen.ts:83. Unbekannte Stufe: NULL.';

/*
 * Die rote Untaetigkeitsschwelle einer Stufe, in Tagen.
 *
 * Kopie der zweiten Zahl aus `INAKTIVITAETS_SCHWELLEN`. Die maszgebliche
 * Tabelle steht in src/lib/inactivityThresholds.ts:16, die Zweitschrift fuer
 * die Edge Functions in supabase/functions/_shared/pipeline-schwellen.ts:33,
 * und `src/lib/pipelineSchwellen.test.ts` haelt die beiden synchron. Diese
 * dritte Fassung haelt kein Test; wer dort etwas aendert, aendert es hier mit.
 *
 * NULL heisst "diese Stufe wird nicht ueberwacht", genau wie
 * `schwellenFuerStufe` (pipeline-schwellen.ts:213) es fuer die Stufen aus
 * `NICHT_UEBERWACHTE_STUFEN` (:198) und fuer unbekannte Stufen liefert.
 */
CREATE OR REPLACE FUNCTION public.kennzahl_schwelle_rot(_stufe text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE _stufe
    WHEN 'neuer_lead'            THEN 4
    WHEN 'nicht_erreicht'        THEN 3
    WHEN 'erreicht'              THEN 3
    WHEN 'erstgespraech_geplant' THEN 7
    WHEN 'eg_noshow'             THEN 3
    WHEN 'beratungsgespraech'    THEN 7
    WHEN 'bg_noshow'             THEN 3
    WHEN 'selbstauskunft'        THEN 7
    WHEN 'bonitaetsunterlagen'   THEN 10
    WHEN 'objektauswahl'         THEN 10
    WHEN 'follow_up_objekt'      THEN 10
    WHEN 'reservierung'          THEN 20
    WHEN 'finanzierung'          THEN 20
    WHEN 'notar'                 THEN 20
    WHEN 'faelligkeit'           THEN 20
    WHEN 'abrechnung'            THEN 20
    WHEN 'zugewiesen'            THEN 3
    WHEN 'vermoegensaufbau'      THEN 14
    ELSE NULL
  END;
$$;

COMMENT ON FUNCTION public.kennzahl_schwelle_rot(text) IS
  'Rote Untaetigkeitsschwelle je Stufe in Tagen. Kopie von '
  'INAKTIVITAETS_SCHWELLEN, src/lib/inactivityThresholds.ts:16 und '
  'supabase/functions/_shared/pipeline-schwellen.ts:33. NULL = nicht ueberwacht.';

/*
 * Die finale Schwelle einer Stufe, in Tagen.
 *
 * Kopie von `FINALE_SCHWELLEN`, supabase/functions/_shared/pipeline-schwellen.ts:94.
 * Ab hier ist keine Erinnerung mehr faellig, sondern eine Entscheidung:
 * weiterfuehren, verlieren oder archivieren. Genau das ist ein Steckenbleiber.
 * Diese Tabelle gibt es nur in den Eskalationsdiensten, sie hat keine
 * Entsprechung in der Anwendung.
 */
CREATE OR REPLACE FUNCTION public.kennzahl_schwelle_final(_stufe text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE _stufe
    WHEN 'neuer_lead'            THEN 7
    WHEN 'nicht_erreicht'        THEN 10
    WHEN 'erreicht'              THEN 7
    WHEN 'erstgespraech_geplant' THEN 14
    WHEN 'eg_noshow'             THEN 7
    WHEN 'beratungsgespraech'    THEN 14
    WHEN 'bg_noshow'             THEN 7
    WHEN 'selbstauskunft'        THEN 14
    WHEN 'bonitaetsunterlagen'   THEN 14
    WHEN 'objektauswahl'         THEN 14
    WHEN 'follow_up_objekt'      THEN 14
    WHEN 'reservierung'          THEN 30
    WHEN 'finanzierung'          THEN 30
    WHEN 'notar'                 THEN 30
    WHEN 'faelligkeit'           THEN 30
    WHEN 'abrechnung'            THEN 30
    WHEN 'zugewiesen'            THEN 7
    WHEN 'vermoegensaufbau'      THEN 21
    ELSE NULL
  END;
$$;

COMMENT ON FUNCTION public.kennzahl_schwelle_final(text) IS
  'Finale Schwelle je Stufe in Tagen, ab der eine Entscheidung faellig ist. '
  'Kopie von FINALE_SCHWELLEN, supabase/functions/_shared/pipeline-schwellen.ts:94.';

/*
 * Der Kaufpreis eines Investments, mit allen Ersatzstellen.
 *
 * Wortgetreue Uebersetzung von `price` aus src/lib/statistikController.ts:85.
 * Die Reihenfolge ist wichtig: Eine Null im ersten Feld beendet die Kette,
 * genau wie der `??`-Operator dort. Negatives und Unlesbares zaehlt als null,
 * so wie `amount` (:48).
 */
CREATE OR REPLACE FUNCTION public.kennzahl_investment_preis(_meta jsonb, _kaufpreis numeric)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN wert IS NULL OR wert < 0 THEN 0
    ELSE wert
  END
  FROM (
    SELECT coalesce(
      public.kennzahl_zahl(_meta->>'kaufpreis'),
      public.kennzahl_zahl(_meta->'rvVirtualWohnung'->>'kaufpreis'),
      public.kennzahl_zahl(_meta->'wohnungSnapshot'->>'kaufpreis'),
      public.kennzahl_zahl(_meta->'wohnungSnapshot'->>'vkGesamt'),
      public.kennzahl_zahl(_meta->'wohnungSnapshot'->>'vk_gesamt'),
      _kaufpreis,
      public.kennzahl_zahl(_meta->'objektSnapshot'->>'kaufpreis')
    ) AS wert
  ) AS q;
$$;

COMMENT ON FUNCTION public.kennzahl_investment_preis(jsonb, numeric) IS
  'Kaufpreis eines Investments samt Ersatzstellen, Uebersetzung von price() '
  'in src/lib/statistikController.ts:85.';

REVOKE ALL ON FUNCTION public.kennzahl_zahl(text) FROM anon;
REVOKE ALL ON FUNCTION public.kennzahl_datum(text) FROM anon;
REVOKE ALL ON FUNCTION public.kennzahl_wahrscheinlichkeit(text) FROM anon;
REVOKE ALL ON FUNCTION public.kennzahl_schwelle_rot(text) FROM anon;
REVOKE ALL ON FUNCTION public.kennzahl_schwelle_final(text) FROM anon;
REVOKE ALL ON FUNCTION public.kennzahl_investment_preis(jsonb, numeric) FROM anon;

-- ---------------------------------------------------------------------------
-- 3) Der zweite Teil des Nachtlaufs
-- ---------------------------------------------------------------------------
--
-- Aufbau wie in 20260909090000_kennzahlen_lauf_reparatur.sql: je KENNZAHL ein
-- eigener Fehlerabfang, und der Zaehler steigt erst nach dem erfolgreichen
-- Schreiben. Eine kaputte Abfrage kostet nur sich selbst.
--
-- WICHTIG ZUM VERSTAENDNIS DER ZAHLEN: Gezaehlt wird immer das ganze Haus,
-- nicht die Sicht eines Nutzers. Auf dem Bildschirm haengt fast jede Zahl
-- daran, wer hinsieht (src/lib/datenSicht.ts). Der Verlauf kennt diese
-- Einschraenkung nicht, er ist die Sicht eines Inhabers.

CREATE OR REPLACE FUNCTION public.kennzahlen_tagesstand_zusatz()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Der Stichtag in deutscher Zeit, gleich wie im ersten Teil.
  v_tag date := (now() AT TIME ZONE 'Europe/Berlin')::date;
  v_geschrieben integer := 0;
  v_zahl bigint;
  v_summe numeric;
  v_summe2 numeric;
  v_nenner bigint;
BEGIN

  -- ═══════════════════════════════════════════════════════════════════════
  -- AGL: Assistenz der Geschaeftsleitung
  -- ═══════════════════════════════════════════════════════════════════════

  /*
   * Ampeln auf Rot.
   *
   * Dieselbe Rechnung, die auch die Erinnerung ausloest: Der Dienst
   * `lead-eskalation-check` (supabase/functions/lead-eskalation-check/index.ts:183)
   * nimmt die Tage seit `aktualisiert_am`, ersatzweise seit `erstellt_am`,
   * und vergleicht sie mit der roten Schwelle der Stufe. Gelesen wird die
   * ROHE Stufe aus `meta.pipelineStufe`, ohne Umschrift, genau wie dort
   * (:145). Nicht ueberwachte und unbekannte Stufen fallen ueber das NULL
   * aus `kennzahl_schwelle_rot` heraus.
   *
   * Abweichung, die man kennen muss: Die Ampel auf dem Bildschirm
   * (`getInactivityInfo`, src/lib/inactivityThresholds.ts:107) schaltet
   * zusaetzlich auf Gruen zurueck, wenn ein Termin oder ein offenes Follow-Up
   * in der Zukunft liegt. Der Eskalationsdienst kennt diese Pause nicht.
   * Diese Zahl folgt dem Dienst, weil sie zu dem passen soll, was tatsaechlich
   * hinausgeht. Sie kann deshalb hoeher sein als das, was jemand auf der
   * Pipeline-Seite an roten Kacheln zaehlt.
   */
  BEGIN
    SELECT count(*) INTO v_zahl
      FROM public.kontakte k
     WHERE coalesce(k.archiviert, false) = false
       AND coalesce(k.geloescht, false) = false
       AND public.kennzahl_schwelle_rot(k.meta->>'pipelineStufe') IS NOT NULL
       AND floor(extract(epoch FROM now() - coalesce(k.aktualisiert_am, k.erstellt_am)) / 86400)
           >= public.kennzahl_schwelle_rot(k.meta->>'pipelineStufe');
    PERFORM public.kennzahl_schreiben(v_tag, 'AGL', 'ampel_rot', v_zahl);
    v_geschrieben := v_geschrieben + 1;
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'AGL.ampel_rot uebersprungen: %', SQLERRM;
  END;

  -- ═══════════════════════════════════════════════════════════════════════
  -- OPS: Operative Leitung
  -- ═══════════════════════════════════════════════════════════════════════

  /*
   * Steckenbleiber.
   *
   * Nicht "ist ueberfaellig", sondern "braucht eine Entscheidung". Dieselbe
   * Rechnung wie oben, aber mit der FINALEN Schwelle statt der roten
   * (supabase/functions/lead-eskalation-check/index.ts:185, Schwellen in
   * supabase/functions/_shared/pipeline-schwellen.ts:94). Ab dieser Grenze
   * schickt der Dienst keine Erinnerung mehr, sondern meldet an die Aufsicht:
   * weiterfuehren, verlieren oder archivieren.
   *
   * Es gibt im Projekt eine zweite Lesart von "haengt": Die Statistikseite
   * zaehlt unter "Stufenfrist ueberschritten" die Vorgaenge, deren
   * Stufeneintritt `investments.meta.pipelineSeit` laenger zurueckliegt als
   * die dortige SLA-Tabelle erlaubt (src/lib/statistikController.ts:210).
   * Das ist eine andere Frage und ergibt eine andere Zahl. Hier gilt die
   * Erinnerungskette, weil Miriams Kachel neben genau der Mail steht, die
   * daraus entsteht.
   */
  BEGIN
    SELECT count(*) INTO v_zahl
      FROM public.kontakte k
     WHERE coalesce(k.archiviert, false) = false
       AND coalesce(k.geloescht, false) = false
       AND public.kennzahl_schwelle_final(k.meta->>'pipelineStufe') IS NOT NULL
       AND floor(extract(epoch FROM now() - coalesce(k.aktualisiert_am, k.erstellt_am)) / 86400)
           >= public.kennzahl_schwelle_final(k.meta->>'pipelineStufe');
    PERFORM public.kennzahl_schreiben(v_tag, 'OPS', 'steckenbleiber', v_zahl);
    v_geschrieben := v_geschrieben + 1;
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'OPS.steckenbleiber uebersprungen: %', SQLERRM;
  END;

  /*
   * Aeltester Vorgang, in Tagen.
   *
   * Der laengste Stillstand unter den Vorgaengen, die ueber ihrer roten
   * Schwelle liegen. Dieselbe Menge wie AGL.ampel_rot, nur statt der Anzahl
   * ihr Hoechstwert. Eine solche Zahl rechnet das CRM heute nirgends; der
   * Wochenbericht sortiert lediglich absteigend danach
   * (supabase/functions/weekly-pipeline-mahnreport/index.ts:90).
   *
   * Gibt es keinen einzigen roten Vorgang, wird nichts geschrieben. Eine Null
   * hiesse "der aelteste Vorgang liegt null Tage", und das waere falsch.
   */
  BEGIN
    SELECT max(floor(extract(epoch FROM now() - coalesce(k.aktualisiert_am, k.erstellt_am)) / 86400))
      INTO v_summe
      FROM public.kontakte k
     WHERE coalesce(k.archiviert, false) = false
       AND coalesce(k.geloescht, false) = false
       AND public.kennzahl_schwelle_rot(k.meta->>'pipelineStufe') IS NOT NULL
       AND floor(extract(epoch FROM now() - coalesce(k.aktualisiert_am, k.erstellt_am)) / 86400)
           >= public.kennzahl_schwelle_rot(k.meta->>'pipelineStufe');
    IF v_summe IS NOT NULL THEN
      PERFORM public.kennzahl_schreiben(v_tag, 'OPS', 'aeltester_vorgang_tage', v_summe);
      v_geschrieben := v_geschrieben + 1;
    END IF;
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'OPS.aeltester_vorgang_tage uebersprungen: %', SQLERRM;
  END;

  /*
   * Fristen der naechsten sieben Tage.
   *
   * Offene Aufgaben und offene Follow-Ups zusammen, deren Faelligkeit von
   * heute an in den naechsten sieben Tagen liegt. "Offen" heisst bei Aufgaben
   * weder erledigt noch abgesagt (src/lib/aufgabenStore.ts:138) und bei
   * Follow-Ups schlicht `status = 'offen'` (src/lib/followUpStore.ts:57).
   * Der Zeitraum ist die Gegenrichtung von `istUeberfaellig`
   * (src/lib/faelligkeit.ts:48): Was schon vorbei ist, zaehlt hier nicht mehr,
   * dafuer gibt es OPS.aufgaben_ueberfaellig und OPS.follow_ups_ueberfaellig.
   *
   * Bewusst NICHT aus der Tabelle `fristen`. Dort traegt die Spalte `status`
   * in Wahrheit die Prioritaet (src/lib/fristenStore.ts:62 schreibt
   * `status: f.prioritaet`), die Seite ist auf die Hausverwaltung beschraenkt
   * und steht als Entwurf in src/lib/draftRoutes.ts. Eine Frist im Sinne der
   * operativen Leitung ist etwas anderes.
   */
  BEGIN
    SELECT (
      SELECT count(*) FROM public.aufgaben a
       WHERE a.status::text NOT IN ('erledigt', 'abgesagt')
         AND a.faellig_am IS NOT NULL
         AND (a.faellig_am AT TIME ZONE 'UTC')::date BETWEEN v_tag AND v_tag + 7
    ) + (
      SELECT count(*) FROM public.follow_ups f
       WHERE coalesce(f.status, 'offen') = 'offen'
         AND public.kennzahl_datum(f.faellig_am) BETWEEN v_tag AND v_tag + 7
    ) INTO v_zahl;
    PERFORM public.kennzahl_schreiben(v_tag, 'OPS', 'fristen_7_tage', v_zahl);
    v_geschrieben := v_geschrieben + 1;
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'OPS.fristen_7_tage uebersprungen: %', SQLERRM;
  END;

  -- ═══════════════════════════════════════════════════════════════════════
  -- VL: Vertriebsleitung
  -- ═══════════════════════════════════════════════════════════════════════

  /*
   * Lead zu Termin, in Prozent.
   *
   * Der zweite Schritt der Belegkette auf der Statistikseite
   * (`conversion` in src/lib/statistikController.ts:368, Beschriftung
   * "Erstgespraech vereinbart"). Als Beleg gilt eines von drei Feldern:
   * `meta.erstgespraechTermin`, `meta.erstgespraechAt` oder
   * `meta.setterTerminGebucht` (:375).
   *
   * Abweichung: Auf dem Bildschirm ist der Nenner nur, was im gewaehlten
   * Zeitraum angelegt wurde. Der Verlauf kennt keinen Zeitraum und rechnet
   * ueber den ganzen Bestand, so wie jede andere Zahl in dieser Tabelle.
   * Die beiden Zahlen werden sich deshalb unterscheiden, und zwar umso mehr,
   * je aelter der Altbestand ist.
   *
   * Ausgeschlossen sind Demo- und Testkunden, so wie `cancelled`
   * (src/lib/statistikController.ts:65) sie ueber `isKontaktStatsExcluded`
   * (src/lib/statsExclusion.ts:19) ausschliesst. Die beiden dort fest
   * eingetragenen Kennungen stehen hier mit, sonst waere es eine andere Menge.
   */
  BEGIN
    SELECT count(*) FILTER (
             WHERE coalesce(k.meta->>'erstgespraechTermin', '') <> ''
                OR coalesce(k.meta->>'erstgespraechAt', '') <> ''
                OR k.meta->>'setterTerminGebucht' = 'true'
           ),
           count(*)
      INTO v_zahl, v_nenner
      FROM public.kontakte k
     WHERE coalesce(k.archiviert, false) = false
       AND coalesce(k.geloescht, false) = false
       AND coalesce(k.meta->>'_excludeFromStats', '') <> 'true'
       AND coalesce(k.meta->>'_testData', '') <> 'true'
       AND k.id NOT IN (
             '086acaeb-0ff9-4577-b114-3b973797d635'::uuid,
             '9d2957d5-f165-41d5-8e25-c0b4655169b2'::uuid
           );
    IF v_nenner > 0 THEN
      PERFORM public.kennzahl_schreiben(v_tag, 'VL', 'conversion_lead_termin',
                                        round(v_zahl::numeric * 100 / v_nenner));
      v_geschrieben := v_geschrieben + 1;
    END IF;
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'VL.conversion_lead_termin uebersprungen: %', SQLERRM;
  END;

  /*
   * Gewichteter Forecast und offenes Volumen, in Euro.
   *
   * Uebersetzung von `pipeline()` aus src/lib/statistikController.ts:148, und
   * zwar der Rueckgabewerte `weighted` (:302) und `volume` (:301). Genau diese
   * beiden Zahlen stehen auf der Statistikseite als "Gewichtetes
   * Kaufpreisvolumen" und "Offenes Kaufpreisvolumen"
   * (src/pages/Statistiken.tsx:673 und :679).
   *
   * Drei Dinge, die man wissen muss:
   *
   *   1. DER BETRAG HAENGT AM INVESTMENT, nicht am Kontakt. Entscheidung vom
   *      10.09.2026. Kontaktbudgets ohne Investment bleiben draussen, sie
   *      stehen dort in einer eigenen Zahl.
   *   2. DIE WAHRSCHEINLICHKEIT HAENGT EBENFALLS AM INVESTMENT, an seiner
   *      eigenen Stufe (:247). Ein Kunde mit zwei Investments in zwei Stufen
   *      wird zweimal und verschieden gewichtet.
   *   3. Eine unbekannte Stufe wiegt null (:252), nicht 0,1.
   *
   * Offen heisst: das Investment ist weder storniert noch verloren noch
   * archiviert (:154), hat den Notartermin nicht hinter sich und traegt kein
   * Kaufdatum (`closed`, :75), und sein Kontakt ist ebenfalls offen (:163).
   *
   * Eine dritte Fassung derselben Zahl liegt in
   * src/components/statistiken/StatistikOpportunity.tsx:49. Die Datei wird von
   * nichts importiert und ist toter Code; sie gewichtet mit der Stufe des
   * KONTAKTS und kaeme deshalb auf ein anderes Ergebnis.
   */
  BEGIN
    WITH inv AS (
      SELECT i.id,
             i.kunde_id,
             public.kennzahl_stufe(i.meta->>'pipelineStufe') AS stufe,
             public.kennzahl_investment_preis(i.meta, i.kaufpreis) AS preis
        FROM public.investments i
       WHERE coalesce(i.status, '') NOT IN ('storniert', 'geloescht', 'verloren')
         AND coalesce(i.meta->>'_excludeFromStats', '') <> 'true'
         AND coalesce(i.meta->>'_testData', '') <> 'true'
         AND public.kennzahl_stufe(i.meta->>'pipelineStufe') NOT IN ('verloren', 'archiviert')
         AND public.kennzahl_stufe(i.meta->>'pipelineStufe')
             NOT IN ('faelligkeit', 'abrechnung', 'abgeschlossen', 'bestandsimport')
         AND public.kennzahl_datum(i.kaufdatum) IS NULL
    ),
    offen AS (
      SELECT inv.*
        FROM inv
        JOIN public.kontakte k ON k.id = inv.kunde_id
       WHERE coalesce(k.archiviert, false) = false
         AND coalesce(k.geloescht, false) = false
         AND coalesce(k.status::text, '') <> 'verloren'
         AND public.kennzahl_stufe(k.meta->>'pipelineStufe') NOT IN ('verloren', 'archiviert')
         AND coalesce(k.meta->>'_excludeFromStats', '') <> 'true'
         AND coalesce(k.meta->>'_testData', '') <> 'true'
    )
    SELECT round(sum(preis * coalesce(public.kennzahl_wahrscheinlichkeit(stufe), 0))),
           round(sum(preis))
      INTO v_summe, v_summe2
      FROM offen;
    PERFORM public.kennzahl_schreiben(v_tag, 'VL', 'forecast_gewichtet', coalesce(v_summe, 0));
    v_geschrieben := v_geschrieben + 1;
    PERFORM public.kennzahl_schreiben(v_tag, 'VL', 'volumen_offen', coalesce(v_summe2, 0));
    v_geschrieben := v_geschrieben + 1;
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'VL.forecast_gewichtet uebersprungen: %', SQLERRM;
  END;

  /*
   * Partner ohne Bewegung.
   *
   * Vertriebspartner und Vertriebsleiter mit nicht gesperrtem Profil, an deren
   * Kunden seit vierzehn Tagen nichts mehr geschehen ist. Partner ganz ohne
   * zugewiesene Kunden zaehlen mit, denn auch sie bewegen nichts.
   *
   * NEU DEFINIERT. Das CRM rechnet diese Zahl heute nirgends. Zusammengesetzt
   * ist sie aus zwei vorhandenen Teilen: dem Aktivitaetsbegriff aus
   * src/components/auswertungen/MeinTeamSection.tsx:71 (die letzte Bewegung
   * eines Partners ist das juengste `aktualisiert_am` seiner Kontakte) und der
   * Schwelle aus `get_sla_thresholds`
   * (supabase/migrations/20260531175634_...sql:7), wo die rote Grenze fuer
   * einen Vertriebspartner bei vierzehn Tagen liegt.
   *
   * Was diese Zahl NICHT ist: ein Mass fuer Fleiss. `aktualisiert_am` steigt
   * auch, wenn eine Automatik den Kontakt anfasst.
   */
  BEGIN
    SELECT count(DISTINCT r.user_id) INTO v_zahl
      FROM public.user_roles r
      JOIN public.profiles p ON p.id = r.user_id
     WHERE r.role::text IN ('vertriebspartner', 'vertriebsleiter')
       AND coalesce(p.gesperrt, false) = false
       AND NOT EXISTS (
         SELECT 1 FROM public.kontakte k
          WHERE k.zustaendig_id = r.user_id
            AND coalesce(k.geloescht, false) = false
            AND coalesce(k.aktualisiert_am, k.erstellt_am) > now() - interval '14 days'
       );
    PERFORM public.kennzahl_schreiben(v_tag, 'VL', 'partner_ohne_bewegung', v_zahl);
    v_geschrieben := v_geschrieben + 1;
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'VL.partner_ohne_bewegung uebersprungen: %', SQLERRM;
  END;

  -- ═══════════════════════════════════════════════════════════════════════
  -- TEC: Technik und CRM-Qualitaet
  -- ═══════════════════════════════════════════════════════════════════════

  /*
   * Stille Fehler.
   *
   * Befunde des letzten Nachtpruefungslaufs mit der Schwere "fehler" und
   * mindestens einem Treffer. Die drei Schweregrade stehen in
   * supabase/migrations/20260805100000_nachtpruefung.sql:40; "fehler" heisst
   * dort ausdruecklich "ist kaputt". Dieselbe Auswahl des juengsten Laufs wie
   * `nachtpruefung_bericht()`.
   *
   * Unterschied zu OPS.nachtpruefung_befunde_offen: Jene Zahl zaehlt alle
   * Befunde mit Treffern, also auch Hinweise und Warnungen. Diese hier zaehlt
   * nur das Kaputte. Zwei Zahlen aus derselben Tabelle, mit Absicht: Nils
   * sieht das Kaputte, Miriam sieht alles Offene.
   *
   * Die Tabelle trennt nicht zwischen technischen Befunden und
   * Prozessbefunden. `videoraum_haengt` steht neben `kontakt_ohne_zustaendigen`.
   * Eine Kennzahl "nur technische Fehler" gaebe es nur mit einer neuen Spalte.
   */
  BEGIN
    SELECT count(*) INTO v_zahl
      FROM public.nachtpruefung_befunde b
     WHERE b.lauf_at = (SELECT max(lauf_at) FROM public.nachtpruefung_befunde)
       AND b.schwere = 'fehler'
       AND b.anzahl > 0;
    PERFORM public.kennzahl_schreiben(v_tag, 'TEC', 'nachtpruefung_fehler', v_zahl);
    v_geschrieben := v_geschrieben + 1;
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'TEC.nachtpruefung_fehler uebersprungen: %', SQLERRM;
  END;

  -- ═══════════════════════════════════════════════════════════════════════
  -- HR: Bewerbermanagement
  -- ═══════════════════════════════════════════════════════════════════════

  /*
   * Gespraeche diese Woche.
   *
   * Bewerbertermine der laufenden Kalenderwoche, Montag bis Sonntag in
   * deutscher Zeit. Ein Bewerbertermin ist eine Buchung mit gesetzter
   * `bewerbung_id`; geschrieben wird sie allein von der Datenbankfunktion
   * `bewerber_termin_buchen`
   * (supabase/migrations/20260906120000_bewerber_terminbuchung.sql:698).
   * Abgesagte zaehlen nicht, genau wie in
   * src/lib/bewerberTerminStore.ts:218, das ebenfalls
   * `.not("bewerbung_id","is",null).neq("status","abgesagt")` filtert.
   *
   * `buchungen` steht hinter einer Pruefung: Die Tabelle stammt aus einer von
   * Hand auszufuehrenden Migration (20260804090000_buchung_grundlage.sql), und
   * ob sie in der Datenbank steht, war beim Lauf am 09.09.2026 ungeklaert.
   */
  IF to_regclass('public.buchungen') IS NOT NULL THEN
    BEGIN
      SELECT count(*) INTO v_zahl
        FROM public.buchungen b
       WHERE b.bewerbung_id IS NOT NULL
         AND coalesce(b.status, '') <> 'abgesagt'
         AND (b.start_at AT TIME ZONE 'Europe/Berlin')::date
             BETWEEN date_trunc('week', v_tag)::date
                 AND date_trunc('week', v_tag)::date + 6;
      PERFORM public.kennzahl_schreiben(v_tag, 'HR', 'gespraeche_woche', v_zahl);
      v_geschrieben := v_geschrieben + 1;
    EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'HR.gespraeche_woche uebersprungen: %', SQLERRM;
    END;
  ELSE
    RAISE NOTICE 'HR.gespraeche_woche uebersprungen: Tabelle buchungen fehlt.';
  END IF;

  /*
   * Wartet ueber drei Tage.
   *
   * Die Bewerber, bei denen die erste Erinnerung der Kennenlernkette faellig
   * ist oder ueberfaellig waere. DIESELBE RECHNUNG WIE DIE KETTE SELBST,
   * damit Kachel und Postfach nicht auseinanderlaufen. Grundlage ist
   * supabase/functions/_shared/kennenlernen-erinnerungen.ts:
   *
   *   * die Schwelle `ERINNERUNG_TAG_1 = 3` (:47),
   *   * `faelligeErinnerung` (:180): Stufe kleiner eins und drei Tage seit der
   *     Einladung,
   *   * `stoppGrund` (:154): keine Mail hinaus, Bogen eingereicht, Stand auf
   *     "Kein Interesse" oder "Abgelehnt", ein Gespraech laeuft, der Stand hat
   *     den Eingang verlassen, eine Pause laeuft, der Link ist abgelaufen oder
   *     die Kette ist durch,
   *   * die Nachfass-Sperre von einem Tag (:176),
   *   * `startTagNachPause` (:421): eine Pause verschiebt den Startpunkt.
   *
   * Zwei Feinheiten der Vorlage sind hier vereinfacht, beide zugunsten einer
   * groesseren Zahl, also der vorsichtigen Richtung:
   *
   *   * `erstgespraechLaeuftLaut` (:366) prueft zusaetzlich, ob im Skript
   *     inhaltlich etwas steht (Assessment, Ausgangslage, Ziele, Motivation,
   *     Vorerfahrung, naechster Schritt). Hier werden nur die drei
   *     Datumsfelder geprueft. Ein Bewerber mit ausgefuelltem Skript, aber
   *     ohne Termin, kann deshalb hier mitzaehlen, obwohl die Kette bei ihm
   *     steht.
   *   * Liegen zu einer Bewerbung mehrere Bogenzeilen vor, gilt die juengste.
   *
   * Gezaehlt wird nur die Anzahl. Keine Namen, keine Kennungen.
   */
  BEGIN
    WITH bogen AS (
      SELECT DISTINCT ON (f.bewerbung_id)
             f.bewerbung_id, f.status, f.expires_at
        FROM public.bewerber_formular f
       ORDER BY f.bewerbung_id, f.created_at DESC
    ),
    kette AS (
      SELECT b.id,
             /*
              * Startpunkt der Kette, nach einer Pause verschoben. Entspricht
              * `startTagNachPause` (kennenlernen-erinnerungen.ts:421): Ohne
              * lesbares Einladungsdatum laeuft keine Kette, und ein spaeteres
              * Pausenende verschiebt den Start nach hinten.
              */
             CASE
               WHEN public.kennzahl_datum(b.meta->'kennenlernen'->>'gesendetAm') IS NULL
                 THEN NULL
               ELSE greatest(
                 public.kennzahl_datum(b.meta->'kennenlernen'->>'gesendetAm'),
                 public.kennzahl_datum(b.meta->'kennenlernen'->'pause'->>'erinnerungAm')
               )
             END AS start_tag,
             bo.status AS bogen_status,
             bo.expires_at
        FROM public.bewerbungen b
        LEFT JOIN bogen bo ON bo.bewerbung_id = b.id
       WHERE (b.meta->>'_type' IS NULL OR b.meta->>'_type' = 'bewerber')
         AND coalesce(b.meta->'kennenlernen'->>'gesendetAm', '') <> ''
         -- stoppGrund: der Stand hat den Eingang noch nicht verlassen.
         AND coalesce(b.status, 'Eingang') = 'Eingang'
         -- stoppGrund: der Bogen ist nicht abgeschickt.
         AND coalesce(bo.status, '') <> 'eingereicht'
         -- stoppGrund: es laeuft kein Gespraech.
         AND coalesce(b.meta->>'erstgespraechDatum', '') = ''
         AND coalesce(b.meta->>'closingTerminDatum', '') = ''
         AND coalesce(b.meta->'erstgespraechSkript'->>'durchgefuehrtAm', '') = ''
         -- stoppGrund: es laeuft keine Pause. Eine Pause ohne Erinnerungsdatum
         -- endet nie von selbst ("ich melde mich selbst").
         AND NOT (
           coalesce(b.meta->'kennenlernen'->'pause'->>'gesetztAm', '') <> ''
           AND (
             coalesce(b.meta->'kennenlernen'->'pause'->>'erinnerungAm', '') = ''
             OR public.kennzahl_datum(b.meta->'kennenlernen'->'pause'->>'erinnerungAm') > v_tag
           )
         )
         -- faelligeErinnerung: die erste Erinnerung ist noch nicht hinaus.
         -- Der Umweg ueber `kennzahl_zahl` statt eines Casts ist Absicht: Steht
         -- dort einmal etwas anderes als eine Zahl, soll die Kennzahl nicht
         -- abbrechen.
         AND coalesce(public.kennzahl_zahl(b.meta->'kennenlernen'->>'erinnerungStufe'), 0) < 1
         -- Nachfass-Sperre: die Welle von Hand ging nicht gerade erst hinaus.
         AND (
           coalesce(b.meta->>'nachfassMailAm', '') = ''
           OR public.kennzahl_datum(b.meta->>'nachfassMailAm') < v_tag
         )
    )
    SELECT count(*) INTO v_zahl
      FROM kette
     WHERE start_tag IS NOT NULL
       -- stoppGrund: der Link ist nicht abgelaufen.
       AND (expires_at IS NULL OR expires_at > now())
       AND v_tag - start_tag >= 3;
    PERFORM public.kennzahl_schreiben(v_tag, 'HR', 'wartend_ueber_3_tage', v_zahl);
    v_geschrieben := v_geschrieben + 1;
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'HR.wartend_ueber_3_tage uebersprungen: %', SQLERRM;
  END;

  -- ═══════════════════════════════════════════════════════════════════════
  -- VA: Vertriebsakademie
  -- ═══════════════════════════════════════════════════════════════════════

  /*
   * Partner in Einarbeitung.
   *
   * Vertriebspartner mit nicht gesperrtem Profil, deren Einarbeitung noch
   * nicht abgeschlossen ist. Das Feld `profiles.onboarding_abgeschlossen_am`
   * stammt aus supabase/migrations/20260806160000_partner_pflichtunterlagen.sql:82
   * und wird in src/hooks/useUnterlagenStand.ts:77 ausgewertet.
   *
   * NEU DEFINIERT. Einen benannten Zustand "in Einarbeitung" gibt es im Code
   * nicht. Die Wahl faellt bewusst auf das Onboarding und nicht auf den
   * Akademiefortschritt: `va_partner_fortschritt` fuellt sich nur, wenn jemand
   * die Wissenswelt oeffnet, und ein Partner, der sie nie oeffnet, saehe dort
   * aus wie ein fertig eingearbeiteter.
   */
  BEGIN
    SELECT count(DISTINCT r.user_id) INTO v_zahl
      FROM public.user_roles r
      JOIN public.profiles p ON p.id = r.user_id
     WHERE r.role::text = 'vertriebspartner'
       AND coalesce(p.gesperrt, false) = false
       AND p.onboarding_abgeschlossen_am IS NULL;
    PERFORM public.kennzahl_schreiben(v_tag, 'VA', 'partner_in_einarbeitung', v_zahl);
    v_geschrieben := v_geschrieben + 1;
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'VA.partner_in_einarbeitung uebersprungen: %', SQLERRM;
  END;

  -- ═══════════════════════════════════════════════════════════════════════
  -- ST: Verkaufstraining, Weekly Call
  -- ═══════════════════════════════════════════════════════════════════════

  /*
   * Tage bis zum naechsten Weekly Call.
   *
   * `public.weekly_call_woche()` ist die einzige Stelle in der Datenbank, an
   * der der Stichtag des Calls steht
   * (supabase/migrations/20260824140000_weekly_call_punkte.sql:30, seither
   * verlegt auf Montag durch 20260826090000 und 20260901180000_weekly_call_schnitt_2030).
   * Null heisst: der Call ist heute.
   *
   * Der Termin selbst ist ein Datum und passt nicht in eine Zahlenspalte.
   * Deshalb die Zahl der Tage. Eine Kachel "Naechster Weekly Call" mit einem
   * Datum bleibt Handarbeit.
   */
  BEGIN
    SELECT (public.weekly_call_woche() - v_tag) INTO v_zahl;
    PERFORM public.kennzahl_schreiben(v_tag, 'ST', 'weekly_call_in_tagen', v_zahl);
    v_geschrieben := v_geschrieben + 1;
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'ST.weekly_call_in_tagen uebersprungen: %', SQLERRM;
  END;

  /*
   * Punkte auf der Liste.
   *
   * Die noch nicht besprochenen Punkte des anstehenden Calls. Tabelle und
   * Spalten aus supabase/migrations/20260824140000_weekly_call_punkte.sql:49,
   * "besprochen" ist dort `besprochen_am IS NOT NULL` (:188).
   *
   * Gezaehlt wird direkt auf der Tabelle und nicht ueber
   * `weekly_call_punkte_lesen`. Jene Funktion gibt bewusst keine Verfasser
   * heraus; hier wird ohnehin nur gezaehlt, und die Zahl traegt keinen Namen.
   */
  BEGIN
    SELECT count(*) INTO v_zahl
      FROM public.weekly_call_punkte p
     WHERE p.call_termin = public.weekly_call_woche()
       AND p.besprochen_am IS NULL;
    PERFORM public.kennzahl_schreiben(v_tag, 'ST', 'weekly_call_punkte_offen', v_zahl);
    v_geschrieben := v_geschrieben + 1;
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'ST.weekly_call_punkte_offen uebersprungen: %', SQLERRM;
  END;

  -- ═══════════════════════════════════════════════════════════════════════
  -- MKT: Social Media und Marketing
  -- ═══════════════════════════════════════════════════════════════════════

  /*
   * Kampagnen mit Leads in den letzten dreissig Tagen.
   *
   * Es gibt im System keine Kampagne als Datensatz, nirgends stehen Name,
   * Laufzeit oder Status. Eine Kampagne ist ausschliesslich eine Kennung am
   * Kontakt, `meta.kampagne.utmCampaign` (src/lib/kampagnenKennung.ts:66), und
   * genau danach gruppiert auch die Auswertung
   * (src/components/statistiken/StatistikConversion.tsx:148).
   *
   * "Laufend" ist deshalb nicht feststellbar. Was sich feststellen laesst, ist
   * "hat in den letzten dreissig Tagen einen Lead gebracht", und das ist diese
   * Zahl. Die Kachel sollte entsprechend heissen; steht "Laufende Kampagnen"
   * darueber, verspricht sie mehr, als die Zahl haelt.
   */
  BEGIN
    SELECT count(DISTINCT lower(btrim(k.meta->'kampagne'->>'utmCampaign'))) INTO v_zahl
      FROM public.kontakte k
     WHERE coalesce(k.geloescht, false) = false
       AND k.erstellt_am > now() - interval '30 days'
       AND jsonb_typeof(k.meta->'kampagne') = 'object'
       AND coalesce(k.meta->'kampagne'->>'utmCampaign', '') <> '';
    PERFORM public.kennzahl_schreiben(v_tag, 'MKT', 'kampagnen_mit_leads_30_tage', v_zahl);
    v_geschrieben := v_geschrieben + 1;
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'MKT.kampagnen_mit_leads_30_tage uebersprungen: %', SQLERRM;
  END;

  -- ═══════════════════════════════════════════════════════════════════════
  -- OBJ: Objektmanagement
  -- ═══════════════════════════════════════════════════════════════════════

  /*
   * Offene Einreichungen.
   *
   * Eingereicht oder in Pruefung, also alles, wozu die Oberflaeche noch
   * "Annehmen" oder "Ablehnen" anbietet
   * (src/pages/ObjektEinreichungDetail.tsx:221). Die fuenf Statuswerte stehen
   * in src/pages/ObjektEinreichungen.tsx:15.
   *
   * WARUM NICHT NUR "eingereicht": Das blosse Oeffnen der Liste schreibt alle
   * eingereichten Vorgaenge pauschal auf "in Pruefung" um, ohne dass jemand
   * etwas entschieden haette (src/pages/ObjektEinreichungen.tsx:51). Eine
   * Kennzahl "neu" waere damit in Wahrheit "seit dem letzten Oeffnen der Seite
   * eingegangen" und faele beim ersten Blick jemandes auf null.
   */
  IF to_regclass('public.objekt_einreichungen') IS NOT NULL THEN
    BEGIN
      SELECT count(*) INTO v_zahl
        FROM public.objekt_einreichungen e
       WHERE coalesce(e.status, 'eingereicht') IN ('eingereicht', 'in_pruefung');
      PERFORM public.kennzahl_schreiben(v_tag, 'OBJ', 'einreichungen_offen', v_zahl);
      v_geschrieben := v_geschrieben + 1;
    EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'OBJ.einreichungen_offen uebersprungen: %', SQLERRM;
    END;
  ELSE
    RAISE NOTICE 'OBJ.einreichungen_offen uebersprungen: Tabelle objekt_einreichungen fehlt.';
  END IF;

  /*
   * Laengste Standzeit, in Tagen.
   *
   * Das aelteste freigegebene und sichtbare Objekt, das noch mindestens eine
   * freie Einheit hat, gerechnet ab `objekte.erstellt_am`. Sichtbar und
   * freigegeben ist die Bedingung, unter der ein Objekt ueberhaupt zum Verkauf
   * steht (src/lib/objekteStore.ts:1052). "Frei" ist eine Einheit, die weder
   * reserviert noch gesetzt noch verkauft ist (src/lib/objekteStore.ts:426).
   *
   * NEU DEFINIERT, und mit einer Einschraenkung, die man kennen muss:
   * Gerechnet wird ab dem Anlegen des OBJEKTS, nicht der Einheit.
   * `wohnungen.erstellt_am` ist dafuer unbrauchbar, weil beim Speichern eines
   * Objekts saemtliche Einheiten geloescht und neu eingefuegt werden
   * (src/lib/objekteStore.ts:765); der Zeitstempel springt dabei auf jetzt.
   * Ein `verkauft_am` gibt es nicht. Die Zahl sagt also "so lange liegt dieses
   * Haus schon im Bestand und ist nicht ausverkauft", nicht "so lange steht
   * genau diese Wohnung leer".
   */
  BEGIN
    SELECT max((v_tag - o.erstellt_am::date)) INTO v_summe
      FROM public.objekte o
     WHERE coalesce(o.sichtbar, false) = true
       AND coalesce(o.status, 'freigegeben') = 'freigegeben'
       AND o.erstellt_am IS NOT NULL
       AND EXISTS (
         SELECT 1 FROM public.wohnungen w
          WHERE w.objekt_id = o.id
            AND lower(coalesce(w.status, '')) NOT IN ('reserviert', 'gesetzt', 'verkauft')
       );
    IF v_summe IS NOT NULL THEN
      PERFORM public.kennzahl_schreiben(v_tag, 'OBJ', 'standzeit_max_tage', v_summe);
      v_geschrieben := v_geschrieben + 1;
    END IF;
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'OBJ.standzeit_max_tage uebersprungen: %', SQLERRM;
  END;

  /*
   * Objekte ohne Unterlagen.
   *
   * Freigegebene, sichtbare Objekte, zu denen kein einziges Dokument mit einer
   * hinterlegten Adresse liegt.
   *
   * Warum die Pruefung auf die Adresse und nicht auf das blosse Vorhandensein
   * einer Zeile: Jedes neue Objekt bekommt zehn LEERE Platzhalterzeilen
   * mitgegeben, von "Expose" bis "Wohnflaechenberechnung"
   * (src/lib/objekteStore.ts:310). Sie stehen mit `url = ''` in der Tabelle.
   * Wer nur zaehlt, ob es Zeilen gibt, findet ueberall zehn Dokumente und
   * nirgends eine Datei.
   *
   * NEU DEFINIERT. Eine Liste von Pflichtunterlagen je Objekt gibt es im
   * Projekt nicht; die zehn Namen sind eine Vorlage, keine Pflicht. Deshalb
   * misst diese Zahl nur den klarsten Fall: gar nichts liegt vor.
   */
  BEGIN
    SELECT count(*) INTO v_zahl
      FROM public.objekte o
     WHERE coalesce(o.sichtbar, false) = true
       AND coalesce(o.status, 'freigegeben') = 'freigegeben'
       AND NOT EXISTS (
         SELECT 1 FROM public.objekt_dokumente d
          WHERE d.objekt_id = o.id
            AND coalesce(d.url, '') <> ''
       );
    PERFORM public.kennzahl_schreiben(v_tag, 'OBJ', 'objekte_ohne_unterlagen', v_zahl);
    v_geschrieben := v_geschrieben + 1;
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'OBJ.objekte_ohne_unterlagen uebersprungen: %', SQLERRM;
  END;

  -- ═══════════════════════════════════════════════════════════════════════
  -- BO: Backoffice und Support
  -- ═══════════════════════════════════════════════════════════════════════

  /*
   * Notartermine in den naechsten vierzehn Tagen.
   *
   * Investments in der Stufe Notar, deren Termin zwischen heute und in
   * vierzehn Tagen liegt. Die Vorrangreihenfolge der beiden Datumsfelder ist
   * die von `notarZeitpunkt`
   * (supabase/functions/_shared/notar-zeitpunkt.ts:90): Zuerst gilt der im
   * Kundenportal gewaehlte Termin `meta.notarData.datum`, sonst der im
   * Investment eingetragene `meta.notarTermin`. Beide koennen ISO oder
   * TT.MM.JJJJ tragen, deshalb `kennzahl_datum`.
   *
   * Die Erinnerungskette dazu setzt spaeter an, bei T minus zwei und am Tag
   * selbst (src/hooks/useInvestmentInboxTriggers.ts:166). Vierzehn Tage sind
   * die Vorlaufzeit der Kachel, keine Schwelle einer Kette: Nadine soll die
   * Unterlagen sehen, solange sie noch zu beschaffen sind.
   */
  BEGIN
    SELECT count(*) INTO v_zahl
      FROM public.investments i
     WHERE coalesce(i.status, '') NOT IN ('storniert', 'geloescht')
       AND public.kennzahl_stufe(i.meta->>'pipelineStufe') = 'notar'
       AND coalesce(
             public.kennzahl_datum(i.meta->'notarData'->>'datum'),
             public.kennzahl_datum(i.meta->>'notarTermin')
           ) BETWEEN v_tag AND v_tag + 14;
    PERFORM public.kennzahl_schreiben(v_tag, 'BO', 'notartermine_14_tage', v_zahl);
    v_geschrieben := v_geschrieben + 1;
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'BO.notartermine_14_tage uebersprungen: %', SQLERRM;
  END;

  -- ═══════════════════════════════════════════════════════════════════════
  -- FIN: Finanzierung
  -- ═══════════════════════════════════════════════════════════════════════

  /*
   * Bonitaet unvollstaendig.
   *
   * Investments in der Stufe Bonitaetsunterlagen, bei denen mindestens eines
   * der sechs Pflichtdokumente fehlt. Die Liste steht an genau einer Stelle im
   * Projekt, src/lib/bonitaetDocs.ts:6, und ist hier woertlich uebernommen.
   * WER DORT EIN DOKUMENT ERGAENZT, MUSS ES HIER MITTRAGEN.
   *
   * "Fehlt" heisst weder freigegeben noch hochgeladen, also genau das
   * Praedikat der Mahnung (src/hooks/useInvestmentInboxTriggers.ts:229). Die
   * strengere Lesart, nach der nur "approved" zaehlt, steckt in
   * `sindDokumenteFreigegeben` (src/lib/kontaktPipeline.ts:278) und steuert
   * das Weiterruecken der Stufe. Hier gilt die Mahnung, weil die Kachel neben
   * der Mahnung steht.
   *
   * Der Status liegt in `investments.meta.docStatuses` als Objekt
   * Dokumentname zu Zustand.
   */
  BEGIN
    SELECT count(*) INTO v_zahl
      FROM public.investments i
     WHERE coalesce(i.status, '') NOT IN ('storniert', 'geloescht')
       AND lower(coalesce(i.meta->>'pipelineStufe', '')) = 'bonitaetsunterlagen'
       AND EXISTS (
         SELECT 1
           FROM unnest(ARRAY[
                  'Selbstauskunft',
                  'Personalausweis',
                  'Letzter Gehaltsnachweis',
                  'Vorletzter Gehaltsnachweis',
                  'Vorvorletzter Gehaltsnachweis',
                  'Gehaltsnachweis Dezember Vorjahr'
                ]) AS pflicht(name)
          WHERE coalesce(i.meta->'docStatuses'->>pflicht.name, '')
                NOT IN ('approved', 'uploaded')
       );
    PERFORM public.kennzahl_schreiben(v_tag, 'FIN', 'bonitaet_unvollstaendig', v_zahl);
    v_geschrieben := v_geschrieben + 1;
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'FIN.bonitaet_unvollstaendig uebersprungen: %', SQLERRM;
  END;

  /*
   * Bank schweigt.
   *
   * Vorgaenge mit unterschriebener Reservierungsvereinbarung, zu denen seit
   * mindestens fuenf Tagen kein Finanzierungsangebot vorliegt. Als
   * "unterschrieben" gilt hier, dass eines der drei Unterschriftsdaten gesetzt
   * ist; die Kette fragt zusaetzlich `getRvSigned`
   * (src/lib/investmentsStore.ts), das dieselben Vermerke liest. Fuenf Tage ist
   * die erste Stufe der Erinnerungskette "Finanzierung starten"
   * (src/hooks/useInvestmentInboxTriggers.ts:151, danach 10 und 15), und die
   * drei Datumsfelder sind dieselben, die sie liest (:149).
   *
   * "Angebot liegt vor" ist `getFinanzierungDocStatus(inv, "Finanzierungsangebot")`
   * (src/lib/finanzierungStore.ts:177): irgendein Angebot in der
   * Finanzierungsakte traegt ein Dokument dieses Namens mit einem anderen
   * Status als "none".
   *
   * ACHTUNG BEIM VERSTEHEN DER VERKNUEPFUNG: `finanzierungen.kunde_id`
   * enthaelt die Kennung des INVESTMENTS, nicht die des Kunden. Das steht so
   * in src/lib/finanzierungStore.ts:1 und wird in
   * supabase/migrations/20260415182733_...sql:4 ebenso verbunden.
   *
   * Stumme Kontakte bleiben draussen, genau wie bei der Kette
   * (src/lib/kontaktStumm.ts:22 und useInvestmentInboxTriggers.ts:131).
   *
   * Was diese Zahl NICHT abbildet: die zweite Haelfte der Kette, "Angebot da,
   * Darlehensvertrag fehlt". Deren Startzeitpunkt wird im Browser des
   * jeweiligen Partners gemerkt (useInvestmentInboxTriggers.ts:159) und steht
   * nirgends in der Datenbank.
   */
  BEGIN
    SELECT count(*) INTO v_zahl
      FROM public.investments i
      JOIN public.kontakte k ON k.id = i.kunde_id
     WHERE coalesce(i.status, '') NOT IN ('storniert', 'geloescht')
       AND coalesce(k.meta->>'keineBenachrichtigungen', '') <> 'true'
       AND coalesce(k.geloescht, false) = false
       AND v_tag - coalesce(
             public.kennzahl_datum(i.meta->>'rvSignedAt'),
             public.kennzahl_datum(i.meta->>'rvKundeSignedAt'),
             public.kennzahl_datum(i.meta->>'reservierungUnterschriebenAm')
           ) >= 5
       AND NOT EXISTS (
         SELECT 1
           FROM public.finanzierungen f
           CROSS JOIN LATERAL jsonb_array_elements(
             CASE WHEN jsonb_typeof(f.angebote) = 'array' THEN f.angebote ELSE '[]'::jsonb END
           ) AS angebot
           CROSS JOIN LATERAL jsonb_array_elements(
             CASE WHEN jsonb_typeof(angebot->'dokumente') = 'array'
                  THEN angebot->'dokumente' ELSE '[]'::jsonb END
           ) AS dok
          WHERE f.kunde_id = i.id::text
            AND dok->>'name' = 'Finanzierungsangebot'
            AND coalesce(dok->>'status', 'none') <> 'none'
       );
    PERFORM public.kennzahl_schreiben(v_tag, 'FIN', 'bank_schweigt', v_zahl);
    v_geschrieben := v_geschrieben + 1;
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'FIN.bank_schweigt uebersprungen: %', SQLERRM;
  END;

  /*
   * Weiter zum Notar, in Prozent.
   *
   * Von den Vorgaengen, die die Finanzierung erreicht haben, der Anteil, der
   * inzwischen beim Notar oder dahinter steht. Rechnung und Stufenmengen
   * woertlich aus src/components/dashboard/FinanzierungsPerformanceBlock.tsx:87.
   *
   * DIESE ZAHL IST AUSDRUECKLICH KEINE GENEHMIGUNGSQUOTE DER BANKEN. Eine
   * bankseitige Zusage oder Absage gibt es im System nicht: Das Feld
   * `meta.finanzierungsStatus` kennt zwar den Wert "abgelehnt", aber keine
   * Stelle im Code schreibt ihn jemals, und src/pages/Statistiken.tsx sagt an
   * Ort und Stelle "keine Bank-Genehmigungsquote". Was hier gemessen wird, ist
   * das Weiterruecken in der Pipeline, nichts sonst. Die Kachel sollte
   * entsprechend heissen.
   */
  BEGIN
    SELECT count(*) FILTER (
             WHERE public.kennzahl_stufe(i.meta->>'pipelineStufe') IN (
               'notar', 'faelligkeit', 'abrechnung', 'abgeschlossen'
             )
           ),
           count(*)
      INTO v_zahl, v_nenner
      FROM public.investments i
     WHERE coalesce(i.status, '') NOT IN ('storniert', 'geloescht')
       AND public.kennzahl_stufe(i.meta->>'pipelineStufe') IN (
             'finanzierung', 'notar', 'faelligkeit', 'abrechnung', 'abgeschlossen'
           );
    IF v_nenner > 0 THEN
      PERFORM public.kennzahl_schreiben(v_tag, 'FIN', 'weiter_zum_notar_prozent',
                                        round(v_zahl::numeric * 100 / v_nenner));
      v_geschrieben := v_geschrieben + 1;
    END IF;
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'FIN.weiter_zum_notar_prozent uebersprungen: %', SQLERRM;
  END;

  -- ═══════════════════════════════════════════════════════════════════════
  -- AS: Aftersales
  -- ═══════════════════════════════════════════════════════════════════════

  /*
   * Bestandskunden ohne Kontakt seit neunzig Tagen.
   *
   * "Letzter Kontakt" ist hier der breiteste Begriff, den das Projekt kennt,
   * und er ist bereits ausformuliert: die CTE `last_act` in
   * supabase/migrations/20260807190000_sla_verstoesse_fuer_die_aufsicht.sql:126.
   * Sie nimmt das spaeteste aus `kontakte.aktualisiert_am`, der juengsten
   * Aktivitaet, dem juengsten Follow-Up und der juengsten Kommunikation.
   * Woertlich uebernommen, damit die Zahl nicht neben der Ampel der Aufsicht
   * eine zweite Wahrheit aufmacht.
   *
   * Bestandskunde ist, wer die Stufe Faelligkeit oder weiter erreicht hat,
   * dieselbe Menge wie VL.bestandskunden im ersten Teil des Nachtlaufs.
   *
   * Die neunzig Tage sind keine Erfindung: Der Quartals-Check-In meldet sich
   * alle neunzig Tage seit dem Notartermin
   * (src/hooks/useInvestmentInboxTriggers.ts:203). Eine eigene
   * Neunzig-Tage-Kette fuer den Bestand gibt es nicht; die Follow-Up-Kette
   * nach Abschluss endet nach dreissig Tagen (src/lib/followUpStore.ts:46).
   */
  BEGIN
    WITH bestand AS (
      SELECT k.id, k.aktualisiert_am
        FROM public.kontakte k
       WHERE coalesce(k.archiviert, false) = false
         AND coalesce(k.geloescht, false) = false
         AND public.kennzahl_stufe(k.meta->>'pipelineStufe') IN (
               'faelligkeit', 'abrechnung', 'abgeschlossen', 'bestandsimport'
             )
    ),
    letzter AS (
      SELECT b.id,
             GREATEST(
               b.aktualisiert_am,
               coalesce((SELECT max(a.datum) FROM public.aktivitaeten a
                          WHERE a.kunde_id = b.id::text), 'epoch'::timestamptz),
               coalesce((SELECT max(GREATEST(f.erstellt_am,
                                             coalesce(f.erledigt_am::timestamptz, 'epoch'::timestamptz)))
                           FROM public.follow_ups f
                          WHERE f.kunde_id = b.id::text), 'epoch'::timestamptz),
               coalesce((SELECT max(km.erstellt_am) FROM public.kommunikation km
                          WHERE km.meta->>'kunde_id' = b.id::text), 'epoch'::timestamptz)
             ) AS letzte_beruehrung
        FROM bestand b
    )
    SELECT count(*) INTO v_zahl
      FROM letzter
     WHERE letzte_beruehrung < now() - interval '90 days';
    PERFORM public.kennzahl_schreiben(v_tag, 'AS', 'ohne_kontakt_90_tage', v_zahl);
    v_geschrieben := v_geschrieben + 1;
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'AS.ohne_kontakt_90_tage uebersprungen: %', SQLERRM;
  END;

  /*
   * Kandidaten fuer einen Zweitkauf.
   *
   * Kunden mit mindestens einem durchlaufenen Investment und ohne ein zweites,
   * an dem gerade gearbeitet wird. Ein Zweitkauf ist im System ein NEUES
   * Investment am selben Kunden (src/lib/investmentsStore.ts:463); ein Kunde
   * mit einem offenen zweiten Investment ist deshalb kein Kandidat mehr,
   * sondern schon im Gespraech.
   *
   * "Durchlaufen" ist `NOTAR_DURCHLAUFEN_STUFEN` aus
   * src/lib/abschlussDefinition.ts:37, also Faelligkeit und weiter, und
   * bewusst nicht `ABSCHLUSS_STUFEN` (:17): Bei der Stufe Notar steht der
   * Termin noch bevor.
   *
   * NEU DEFINIERT. Das CRM kennt weder ein Kennzeichen noch eine Auswertung
   * fuer einen Zweitkauf. Die Zahl ist ein Vorschlag und sollte daran gemessen
   * werden, ob Sophie mit ihr etwas anfangen kann.
   */
  BEGIN
    SELECT count(*) INTO v_zahl
      FROM public.kontakte k
     WHERE coalesce(k.archiviert, false) = false
       AND coalesce(k.geloescht, false) = false
       AND EXISTS (
         SELECT 1 FROM public.investments i
          WHERE i.kunde_id = k.id
            AND coalesce(i.status, '') NOT IN ('storniert', 'geloescht')
            AND public.kennzahl_stufe(i.meta->>'pipelineStufe') IN (
                  'faelligkeit', 'abrechnung', 'abgeschlossen'
                )
       )
       AND NOT EXISTS (
         SELECT 1 FROM public.investments i
          WHERE i.kunde_id = k.id
            AND coalesce(i.status, '') NOT IN ('storniert', 'geloescht')
            AND public.kennzahl_stufe(i.meta->>'pipelineStufe') NOT IN (
                  'faelligkeit', 'abrechnung', 'abgeschlossen',
                  'verloren', 'archiviert', 'bestandsimport'
                )
       );
    PERFORM public.kennzahl_schreiben(v_tag, 'AS', 'zweitkauf_kandidaten', v_zahl);
    v_geschrieben := v_geschrieben + 1;
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'AS.zweitkauf_kandidaten uebersprungen: %', SQLERRM;
  END;

  -- ═══════════════════════════════════════════════════════════════════════
  -- CTR: Controlling und Buchhaltung
  -- ═══════════════════════════════════════════════════════════════════════

  /*
   * Beurkundeter Umsatz des laufenden Monats, in Euro.
   *
   * Summe der Kaufpreise aller Investments, deren Notartermin im laufenden
   * Monat liegt UND bereits vorbei ist. Definition aus
   * src/lib/dashboardKpis.ts:210: Dort wird ein Termin in der Zukunft als
   * "geplant" gezaehlt und geht nicht in den Umsatz ein.
   *
   * DIE KACHEL HEISST "Erloese Monat", UND DAS IST IRREFUEHREND. Was hier
   * steht, ist das beurkundete Kaufpreisvolumen, also das, was die Kunden
   * bezahlen. Der Erloes des Hauses ist die Provision daraus, und die haengt
   * je Vorgang an einem Satz, der an mehreren Stellen ermittelt wird
   * (src/lib/karriereStufeHelper.ts:216). Eine Aufwandsseite gibt es
   * ohnehin nicht. Empfehlung: Kachel umbenennen in "Beurkundeter Umsatz
   * Monat".
   *
   * Der Preis kommt aus `kennzahl_investment_preis`, also mit denselben
   * Ersatzstellen wie ueberall sonst. Das Dashboard nimmt an dieser Stelle
   * schlicht `inv.kaufpreis`; bei einem Investment, dessen Preis nur im
   * Wohnungsabbild steht, kann diese Zahl deshalb hoeher liegen.
   */
  BEGIN
    SELECT round(coalesce(sum(public.kennzahl_investment_preis(i.meta, i.kaufpreis)), 0))
      INTO v_summe
      FROM public.investments i
     WHERE coalesce(i.status, '') NOT IN ('storniert', 'geloescht')
       AND coalesce(
             public.kennzahl_datum(i.meta->'notarData'->>'datum'),
             public.kennzahl_datum(i.meta->>'notarTermin')
           ) BETWEEN date_trunc('month', v_tag)::date AND v_tag;
    PERFORM public.kennzahl_schreiben(v_tag, 'CTR', 'umsatz_monat', v_summe);
    v_geschrieben := v_geschrieben + 1;
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'CTR.umsatz_monat uebersprungen: %', SQLERRM;
  END;

  RETURN v_geschrieben;
END;
$$;

REVOKE ALL ON FUNCTION public.kennzahlen_tagesstand_zusatz() FROM anon, authenticated;

COMMENT ON FUNCTION public.kennzahlen_tagesstand_zusatz() IS
  'Zweiter Teil des naechtlichen Kennzahlenlaufs: die Zahlen der uebrigen '
  'Abteilungen. Wird zusammen mit kennzahlen_tagesstand_lauf() vom Zeitplan '
  'gerufen. Jede Kennzahl hat ihren eigenen Fehlerabfang.';

-- ---------------------------------------------------------------------------
-- 4) Der Zeitplan ruft jetzt beide Teile
-- ---------------------------------------------------------------------------
--
-- Uhrzeit unveraendert: 04:10 UTC, also 06:10 deutscher Sommerzeit und 05:10
-- im Winter. Die Begruendung fuer genau diesen Platz steht in
-- 20260908180000_kennzahlen_tagesstand.sql. Neu ist allein, dass der Befehl
-- zwei Anweisungen enthaelt. pg_cron fuehrt sie nacheinander aus; faellt die
-- erste aus, laeuft die zweite trotzdem.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'kennzahlen-tagesstand') THEN
      PERFORM cron.unschedule('kennzahlen-tagesstand');
    END IF;
    PERFORM cron.schedule(
      'kennzahlen-tagesstand',
      '10 4 * * *',
      'SELECT public.kennzahlen_tagesstand_lauf(); SELECT public.kennzahlen_tagesstand_zusatz();'
    );
  ELSE
    RAISE NOTICE 'pg_cron ist nicht installiert, der Zeitplan wurde nicht gesetzt.';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Zeitplan fuer den Kennzahlen-Tagesstand nicht gesetzt: %. Bitte von Hand anlegen.', SQLERRM;
END $$;

-- ---------------------------------------------------------------------------
-- 5) Einmal laufen lassen und nachsehen
-- ---------------------------------------------------------------------------
--
-- Die erste Abfrage gibt die Zahl der neu geschriebenen Kennzahlen zurueck.
-- Erwartet werden 25, oder weniger, wenn eine Tabelle fehlt oder eine Menge
-- leer ist: `OPS.aeltester_vorgang_tage` und `OBJ.standzeit_max_tage` werden
-- bewusst gar nicht geschrieben, wenn es nichts zu messen gibt, und die drei
-- Quoten nur, wenn ihr Nenner groesser als null ist.
--
-- Die zweite Abfrage zeigt die Verteilung je Bereich ueber BEIDE Teile.
-- Erwartet: AGL 6, OPS 9, VL 10, TEC 1, HR 8, VA 4, ST 2, MKT 5, OBJ 9,
-- BO 6, FIN 8, AS 8, CTR 5. Bleibt eine Zahl darunter, nennt die zugehoerige
-- NOTICE-Meldung im Editor den Grund.

SELECT public.kennzahlen_tagesstand_zusatz() AS neue_kennzahlen;

SELECT bereich, count(*) AS kennzahlen
  FROM public.kennzahlen_tagesstand
 WHERE stichtag = (now() AT TIME ZONE 'Europe/Berlin')::date
 GROUP BY bereich
 ORDER BY bereich;
