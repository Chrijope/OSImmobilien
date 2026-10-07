-- ===========================================================================
-- Kennzahlenlauf reparieren: falscher Typvergleich, fehlende Tabelle,
-- zu grober Fehlerabfang
-- ===========================================================================
--
-- WAS AM 09.09.2026 PASSIERT IST
--
-- Der Lauf aus 20260908180000_kennzahlen_tagesstand.sql schreibt 56 Zahlen.
-- Beim ersten echten Durchgang standen danach 43 Zeilen in der Tabelle, die
-- Funktion selbst meldete 53. Gezaehlt je Bereich: AGL 0 von 5, OPS 1 von 6,
-- VA 0 von 3, die uebrigen acht Bereiche vollstaendig.
--
-- Drei Ursachen, alle an der echten Datenbank gemessen:
--
-- 1. FALSCHER TYPVERGLEICH. `investments.kunde_id` ist seit
--    20260517094425 eine `uuid` mit Fremdschluessel auf `kontakte(id)`, nicht
--    mehr Text. Zwei Abfragen verglichen trotzdem `k.id::text` mit
--    `i.kunde_id`, also Text mit uuid. Postgres kennt dafuer keinen Operator
--    und bricht ab. Das kostete AGL die Kennzahl `investments_aktiv` und OPS
--    die Kennzahl `kontakte_ohne_zustaendigen`. Der Kommentar an der Stelle
--    berief sich auf 20260807190000_sla_verstoesse_fuer_die_aufsicht.sql;
--    dort steht der Cast aber an `aktivitaeten.kunde_id` und
--    `follow_ups.kunde_id`, und die sind wirklich Text. Fuer Investments
--    gilt seit der Umstellung die Form aus derselben Migration:
--    `k.id = i.kunde_id`, uuid gegen uuid. Nebenbei greift so auch der
--    Primaerschluessel-Index, genau die Begruendung aus
--    20260827210000_kontaktpruefung_ohne_textcast.sql.
--
-- 2. FEHLENDE TABELLE. `public.va_aufgaben_ergebnisse` steht seit
--    20260727080000 in der Historie des Repos, ist in der Datenbank aber nie
--    angelegt worden, genau wie `analysetool_ereignisse` aus derselben Woche.
--    Die VA-Kennzahl `aufgaben_geloest` haengt daran und brach ab.
--
-- 3. ZU GROBER FEHLERABFANG. Der alte Lauf hatte je BEREICH ein
--    `BEGIN ... EXCEPTION WHEN OTHERS`. Scheitert dort eine einzige Abfrage,
--    macht PL/pgSQL den ganzen Block rueckgaengig, also auch die Kennzahlen,
--    die vorher schon erfolgreich geschrieben waren. Der Zaehler
--    `v_geschrieben` ist dagegen eine Variable und wird von einem Rollback
--    nicht zurueckgesetzt; er war beim Fehler schon hochgelaufen. Deshalb
--    meldete die Funktion 53 und in der Tabelle standen 43. Eine kaputte
--    Abfrage kostete so den gesamten Bereich, und die Rueckmeldung log dazu.
--
-- WAS DIESE MIGRATION AENDERT
--
--   a) Beide Vergleiche stehen jetzt als uuid gegen uuid.
--   b) Je KENNZAHL ein eigener Fehlerabfang statt je Bereich. Eine kaputte
--      Abfrage kostet nur noch sich selbst.
--   c) `v_geschrieben` wird erst nach dem erfolgreichen Schreiben erhoeht.
--      Der Rueckgabewert ist damit die Zahl der Zeilen, die wirklich stehen.
--   d) Kennzahlen, deren Tabelle vielleicht nie angelegt wurde, laufen nur
--      hinter einer Pruefung mit `to_regclass` und werden sonst still
--      uebersprungen (siehe unten, "Welche Tabellen abgesichert sind").
--   e) Am Ende laeuft die Funktion einmal, danach steht die Zaehlung je
--      Bereich im Editor.
--
-- Die Migration von gestern bleibt unangetastet. Sie ist bei GL
-- gelaufen, und die Historie soll zeigen, was war und was repariert wurde.
-- Geaendert wird allein die Funktion `kennzahlen_tagesstand_lauf()` per
-- CREATE OR REPLACE. Tabelle, Hilfsfunktionen, Lesefunktion und Zeitplan
-- bleiben, wie sie sind.
--
-- WARUM KEIN HELFER GEGEN DIE WIEDERHOLUNG
--
-- Der Fehlerabfang wiederholt sich jetzt 56 Mal. Ein Helfer koennte ihn
-- zusammenziehen, muesste die Abfragen dafuer aber als Zeichenketten
-- entgegennehmen und mit EXECUTE ausfuehren. Dann pruefte niemand mehr die
-- Abfragen beim Anlegen der Funktion, die Kommentare mit ihren Anfuehrungs-
-- zeichen muessten durch eine zweite Zitierebene, und ein Tippfehler zeigte
-- sich erst nachts um zehn nach vier. Genau solche Laufzeitfehler haben
-- gestern den halben Lauf gekostet. Die ausgeschriebene Form ist laenger,
-- aber Postgres liest sie beim Anlegen mit.
--
-- WELCHE TABELLEN ABGESICHERT SIND, UND WARUM GERADE DIESE
--
-- Der Lauf am 09.09.2026 ist selbst der beste Nachweis: Acht Bereiche liefen
-- vollstaendig durch, ihre Tabellen gibt es also. Ungeklaert blieben nur die
-- Tabellen in den drei abgebrochenen Bereichen. Abgesichert sind deshalb:
--
--   * `va_aufgaben_ergebnisse`  fehlt nachweislich (Kennzahl aufgaben_geloest),
--   * `va_partner_fortschritt`  ungeprueft, weil der VA-Block vorher abbrach,
--   * `buchungen`               ungeprueft, weil der OPS-Block vorher abbrach,
--                               und aus einer handgeschriebenen Migration
--                               (20260804090000_buchung_grundlage.sql), also
--                               aus der Sorte, die von Hand laufen muss.
--
-- `signature_requests` und `investments` stecken in denselben Abfragen, sind
-- aber durch andere Kennzahlen desselben Laufs belegt (FIN 5 von 5 und der
-- Typfehler an `investments.kunde_id`, den es ohne Tabelle nicht gaebe).
--
-- Die Kennzahl `kontakte_ohne_zustaendigen` wird bei fehlender Tabelle
-- `buchungen` ganz uebersprungen und nicht etwa ohne diesen Teil gerechnet.
-- Eine Zahl, die anders gerechnet wird als die Nachtpruefung, ist schlimmer
-- als eine fehlende Zahl: Sie sieht richtig aus.
--
-- Ob noch mehr Tabellen aus dem Repo in der Datenbank fehlen, beantwortet
-- supabase/migrations-inbox/98_FEHLENDE_TABELLEN.sql.
--
-- Mehrfach ausfuehrbar. Ein zweiter Lauf am selben Tag ersetzt die Werte des
-- Tages, statt sie zu verdoppeln.

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
BEGIN
  -- Aelteres aufraeumen. Zwei Jahre reichen fuer jeden Vergleich, den jemand
  -- wirklich zieht, und die Tabelle bleibt winzig.
  DELETE FROM public.kennzahlen_tagesstand WHERE stichtag < v_tag - 730;

  -- ═══════════════════════════════════════════════════════════════════════
  -- AGL: Assistenz der Geschaeftsleitung, Gesamtsicht
  -- ═══════════════════════════════════════════════════════════════════════

  /*
   * Aktive Kontakte. In der Statistik heisst dieselbe Zahl "Interessenten
   * registriert" (src/pages/Statistiken.tsx:798). Die Menge dahinter ist
   * `filteredKontakte` (src/pages/Statistiken.tsx:291): nicht archiviert und
   * nicht geloescht. Der Zeitraumfilter steht dort auf "seit_anfang"
   * (src/pages/Statistiken.tsx:233), umfasst also alles.
   */
  BEGIN
    SELECT count(*) INTO v_zahl
      FROM public.kontakte k
     WHERE coalesce(k.archiviert, false) = false
       AND coalesce(k.geloescht, false) = false;
    PERFORM public.kennzahl_schreiben(v_tag, 'AGL', 'kontakte_aktiv', v_zahl);
    v_geschrieben := v_geschrieben + 1;
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'AGL.kontakte_aktiv uebersprungen: %', SQLERRM;
  END;

  /*
   * Reservierungen erstellt: alle Kontakte, die mindestens die Stufe
   * Reservierung erreicht haben oder ein Reservierungsdatum tragen.
   * Definition: src/pages/Statistiken.tsx:761 (Liste RESERVIERT_PLUS) und
   * :763 (`|| !!k.meta?.reservierungsDatum`).
   */
  BEGIN
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
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'AGL.reservierungen_erstellt uebersprungen: %', SQLERRM;
  END;

  /*
   * Abschluesse. Zaehler der Abschlussquote in der Statistik
   * (src/pages/Statistiken.tsx:785). Bewusst diese drei Stufen und nicht
   * `ABSCHLUSS_STUFEN` aus src/lib/abschlussDefinition.ts:17: Jene Liste
   * enthaelt zusaetzlich "notar", die Statistik zaehlt einen Notartermin
   * erst ab Faelligkeit als Abschluss.
   */
  BEGIN
    SELECT count(*) INTO v_zahl
      FROM public.kontakte k
     WHERE coalesce(k.archiviert, false) = false
       AND coalesce(k.geloescht, false) = false
       AND public.kennzahl_stufe(k.meta->>'pipelineStufe') IN ('faelligkeit', 'abrechnung', 'abgeschlossen');
    PERFORM public.kennzahl_schreiben(v_tag, 'AGL', 'abschluesse', v_zahl);
    v_geschrieben := v_geschrieben + 1;
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'AGL.abschluesse uebersprungen: %', SQLERRM;
  END;

  /*
   * Partner aktiv: interne Rollen mit einem nicht gesperrten Profil.
   * Definition src/pages/Statistiken.tsx:768 bis :782. Die dortige Pruefung
   * `!p.geloescht && !p.deleted_at` laeuft ins Leere, weil `profiles` diese
   * beiden Spalten nicht hat; in JavaScript ist ein fehlendes Feld falsch,
   * die Bedingung ist also immer erfuellt. Uebrig bleibt `gesperrt`.
   */
  BEGIN
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
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'AGL.partner_aktiv uebersprungen: %', SQLERRM;
  END;

  /*
   * Aktive Investments zu sichtbaren Kontakten (src/pages/Statistiken.tsx:791).
   *
   * HIER LAG FEHLER 1. `investments.kunde_id` ist eine `uuid` mit
   * Fremdschluessel auf `kontakte(id)`, seit
   * 20260517094425_4525f411-76cc-4ef0-a8bb-380e0cd747f6.sql. Der Vergleich
   * lautet deshalb `k.id = i.kunde_id`, wie in den Policies derselben
   * Migration. Ein `::text` auf einer der beiden Seiten bricht ab: Postgres
   * hat keinen Operator fuer Text gegen uuid.
   */
  BEGIN
    SELECT count(*) INTO v_zahl
      FROM public.investments i
      JOIN public.kontakte k ON k.id = i.kunde_id
     WHERE coalesce(i.status, '') NOT IN ('storniert', 'geloescht')
       AND coalesce(k.archiviert, false) = false
       AND coalesce(k.geloescht, false) = false;
    PERFORM public.kennzahl_schreiben(v_tag, 'AGL', 'investments_aktiv', v_zahl);
    v_geschrieben := v_geschrieben + 1;
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'AGL.investments_aktiv uebersprungen: %', SQLERRM;
  END;

  -- ═══════════════════════════════════════════════════════════════════════
  -- OPS: Operative Leitung, Prozesse
  -- ═══════════════════════════════════════════════════════════════════════

  /*
   * Offene Aufgaben. "Offen" heisst im ganzen Projekt: weder erledigt noch
   * abgesagt (src/lib/aufgabenStore.ts:138, ebenso
   * src/lib/dashboardKpis.ts:269).
   */
  BEGIN
    SELECT count(*) INTO v_zahl
      FROM public.aufgaben a
     WHERE a.status::text NOT IN ('erledigt', 'abgesagt');
    PERFORM public.kennzahl_schreiben(v_tag, 'OPS', 'aufgaben_offen', v_zahl);
    v_geschrieben := v_geschrieben + 1;
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'OPS.aufgaben_offen uebersprungen: %', SQLERRM;
  END;

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
  BEGIN
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
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'OPS.aufgaben_ueberfaellig uebersprungen: %', SQLERRM;
  END;

  /*
   * Offene Follow-Ups (src/lib/followUpStore.ts:57 und die serverseitige
   * Entsprechung in
   * supabase/functions/send-followup-overdue-nudges/index.ts:86).
   */
  BEGIN
    SELECT count(*) INTO v_zahl
      FROM public.follow_ups f
     WHERE coalesce(f.status, 'offen') = 'offen';
    PERFORM public.kennzahl_schreiben(v_tag, 'OPS', 'follow_ups_offen', v_zahl);
    v_geschrieben := v_geschrieben + 1;
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'OPS.follow_ups_offen uebersprungen: %', SQLERRM;
  END;

  /*
   * Liegengebliebene Follow-Ups: offen und das Faelligkeitsdatum ist vorbei.
   * Wortgleich zur taeglichen Mahnung
   * (supabase/functions/send-followup-overdue-nudges/index.ts:86 mit
   * `today` aus :10, also dem heutigen Tag in UTC). `faellig_am` ist dort
   * eine Textspalte im Format JJJJ-MM-TT und wird als Text verglichen.
   */
  BEGIN
    SELECT count(*) INTO v_zahl
      FROM public.follow_ups f
     WHERE coalesce(f.status, 'offen') = 'offen'
       AND f.faellig_am IS NOT NULL
       AND f.faellig_am < to_char(v_heute_utc, 'YYYY-MM-DD');
    PERFORM public.kennzahl_schreiben(v_tag, 'OPS', 'follow_ups_ueberfaellig', v_zahl);
    v_geschrieben := v_geschrieben + 1;
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'OPS.follow_ups_ueberfaellig uebersprungen: %', SQLERRM;
  END;

  /*
   * Kontakte ohne Zustaendigen. Dasselbe Praedikat wie in der Nachtpruefung
   * (supabase/migrations/20260807130000_nachtpruefung_pool_drei_tage.sql:62):
   * entweder liegt der Kontakt laenger als drei Tage im offenen Pool, oder
   * an ihm laeuft bereits etwas. Der offene Pool ist ein Zwischenlager,
   * keine Ablage.
   *
   * HIER LAG FEHLER 1 ZUM ZWEITEN MAL: `i.kunde_id = k.id::text` verglich
   * uuid mit Text. Richtig ist `i.kunde_id = k.id`.
   *
   * Die Pruefung auf `buchungen` davor gehoert zu Fehler 2: Die Tabelle
   * stammt aus einer handgeschriebenen Migration
   * (20260804090000_buchung_grundlage.sql) und muss im SQL-Editor von Hand
   * gelaufen sein. Fehlt sie, wird die ganze Kennzahl uebersprungen und
   * nicht etwa ohne diesen Teil gerechnet: Eine Zahl, die anders gerechnet
   * wird als die Nachtpruefung, sieht richtig aus und ist es nicht.
   */
  IF to_regclass('public.buchungen') IS NOT NULL THEN
    BEGIN
      SELECT count(*) INTO v_zahl
        FROM public.kontakte k
       WHERE k.zustaendig_id IS NULL
         AND coalesce(k.geloescht, false) = false
         AND (
           k.erstellt_am < now() - interval '3 days'
           OR EXISTS (SELECT 1 FROM public.signature_requests s
                       WHERE s.kontakt_id = k.id AND s.status = 'pending')
           OR EXISTS (SELECT 1 FROM public.investments i WHERE i.kunde_id = k.id)
           OR EXISTS (SELECT 1 FROM public.buchungen b
                       WHERE b.kontakt_id = k.id AND b.status = 'offen')
         );
      PERFORM public.kennzahl_schreiben(v_tag, 'OPS', 'kontakte_ohne_zustaendigen', v_zahl);
      v_geschrieben := v_geschrieben + 1;
    EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'OPS.kontakte_ohne_zustaendigen uebersprungen: %', SQLERRM;
    END;
  ELSE
    RAISE NOTICE 'OPS: buchungen gibt es in dieser Datenbank nicht, Kennzahl kontakte_ohne_zustaendigen ausgelassen.';
  END IF;

  /*
   * Wie viele Pruefungen des letzten Nachtlaufs etwas gefunden haben.
   * Dieselbe Auswahl wie der Bericht auf /nachtpruefung
   * (public.nachtpruefung_bericht() in
   * supabase/migrations/20260805100000_nachtpruefung.sql): der jeweils
   * letzte Lauf, gezaehlt werden die Zeilen mit Treffern.
   */
  BEGIN
    SELECT count(*) INTO v_zahl
      FROM public.nachtpruefung_befunde b
     WHERE b.lauf_at = (SELECT max(lauf_at) FROM public.nachtpruefung_befunde)
       AND b.anzahl > 0;
    PERFORM public.kennzahl_schreiben(v_tag, 'OPS', 'nachtpruefung_befunde_offen', v_zahl);
    v_geschrieben := v_geschrieben + 1;
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'OPS.nachtpruefung_befunde_offen uebersprungen: %', SQLERRM;
  END;

  -- ═══════════════════════════════════════════════════════════════════════
  -- VL: Vertriebsleitung
  -- ═══════════════════════════════════════════════════════════════════════
  --
  -- Die sechs Gruppen der Kundenuebersicht, Zeile fuer Zeile uebersetzt aus
  -- src/pages/Statistiken.tsx:317 bis :338. Die Reihenfolge der Abfragen ist
  -- dieselbe wie dort, weil dort jede Zeile mit `return` endet: Ein Kontakt
  -- faellt in die erste Gruppe, auf die er passt, und in keine weitere.

  -- Verloren geht vor. Archiviert zaehlt mit dazu, sonst faellt der Vorgang
  -- aus der Uebersicht heraus (Begruendung im Kommentar dort).
  BEGIN
    SELECT count(*) INTO v_zahl
      FROM public.kontakte k
     WHERE coalesce(k.archiviert, false) = false
       AND coalesce(k.geloescht, false) = false
       AND (public.kennzahl_stufe(k.meta->>'pipelineStufe') IN ('verloren', 'archiviert')
            OR k.status::text = 'verloren');
    PERFORM public.kennzahl_schreiben(v_tag, 'VL', 'verloren', v_zahl);
    v_geschrieben := v_geschrieben + 1;
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'VL.verloren uebersprungen: %', SQLERRM;
  END;

  -- In Kontakt.
  BEGIN
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
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'VL.in_kontakt uebersprungen: %', SQLERRM;
  END;

  -- Qualifiziert.
  BEGIN
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
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'VL.qualifiziert uebersprungen: %', SQLERRM;
  END;

  -- In Abwicklung.
  BEGIN
    SELECT count(*) INTO v_zahl
      FROM public.kontakte k
     WHERE coalesce(k.archiviert, false) = false
       AND coalesce(k.geloescht, false) = false
       AND NOT (public.kennzahl_stufe(k.meta->>'pipelineStufe') IN ('verloren', 'archiviert')
                OR k.status::text = 'verloren')
       AND public.kennzahl_stufe(k.meta->>'pipelineStufe') IN ('reservierung', 'finanzierung', 'notar');
    PERFORM public.kennzahl_schreiben(v_tag, 'VL', 'in_abwicklung', v_zahl);
    v_geschrieben := v_geschrieben + 1;
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'VL.in_abwicklung uebersprungen: %', SQLERRM;
  END;

  -- Bestandskunden.
  BEGIN
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
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'VL.bestandskunden uebersprungen: %', SQLERRM;
  END;

  /*
   * Neue Leads. In der Oberflaeche ist das die Auffanggruppe: die Stufe
   * "neuer_lead" und alles, was in keine der anderen Gruppen passt
   * (src/pages/Statistiken.tsx:337, Kommentar "Fallback fuer eine unbekannte
   * Stufe"). Deshalb hier als Rest gerechnet und nicht als eigene Liste,
   * sonst liefen die beiden Stellen bei einer neuen Stufe auseinander.
   */
  BEGIN
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
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'VL.neue_leads uebersprungen: %', SQLERRM;
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
  --
  -- Definitionen: src/components/dashboard/BewerberKpiCard.tsx:19 bis :24.

  BEGIN
    SELECT count(*) INTO v_zahl
      FROM public.bewerbungen b
     WHERE b.meta->>'_type' IS NULL OR b.meta->>'_type' = 'bewerber';
    PERFORM public.kennzahl_schreiben(v_tag, 'HR', 'bewerber_gesamt', v_zahl);
    v_geschrieben := v_geschrieben + 1;
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'HR.bewerber_gesamt uebersprungen: %', SQLERRM;
  END;

  BEGIN
    SELECT count(*) INTO v_zahl
      FROM public.bewerbungen b
     WHERE (b.meta->>'_type' IS NULL OR b.meta->>'_type' = 'bewerber')
       AND public.kennzahl_bewerberstatus(b.status) = 'Eingang';
    PERFORM public.kennzahl_schreiben(v_tag, 'HR', 'bewerber_eingang', v_zahl);
    v_geschrieben := v_geschrieben + 1;
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'HR.bewerber_eingang uebersprungen: %', SQLERRM;
  END;

  BEGIN
    SELECT count(*) INTO v_zahl
      FROM public.bewerbungen b
     WHERE (b.meta->>'_type' IS NULL OR b.meta->>'_type' = 'bewerber')
       AND public.kennzahl_bewerberstatus(b.status) NOT IN ('Aktiv', 'Abgelehnt', 'KeinInteresse');
    PERFORM public.kennzahl_schreiben(v_tag, 'HR', 'bewerber_im_prozess', v_zahl);
    v_geschrieben := v_geschrieben + 1;
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'HR.bewerber_im_prozess uebersprungen: %', SQLERRM;
  END;

  BEGIN
    SELECT count(*) INTO v_zahl
      FROM public.bewerbungen b
     WHERE (b.meta->>'_type' IS NULL OR b.meta->>'_type' = 'bewerber')
       AND public.kennzahl_bewerberstatus(b.status) = 'Aktiv';
    PERFORM public.kennzahl_schreiben(v_tag, 'HR', 'bewerber_aktiv', v_zahl);
    v_geschrieben := v_geschrieben + 1;
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'HR.bewerber_aktiv uebersprungen: %', SQLERRM;
  END;

  BEGIN
    SELECT count(*) INTO v_zahl
      FROM public.bewerbungen b
     WHERE (b.meta->>'_type' IS NULL OR b.meta->>'_type' = 'bewerber')
       AND public.kennzahl_bewerberstatus(b.status) = 'Abgelehnt';
    PERFORM public.kennzahl_schreiben(v_tag, 'HR', 'bewerber_abgelehnt', v_zahl);
    v_geschrieben := v_geschrieben + 1;
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'HR.bewerber_abgelehnt uebersprungen: %', SQLERRM;
  END;

  BEGIN
    SELECT count(*) INTO v_zahl
      FROM public.bewerbungen b
     WHERE (b.meta->>'_type' IS NULL OR b.meta->>'_type' = 'bewerber')
       AND public.kennzahl_bewerberstatus(b.status) = 'KeinInteresse';
    PERFORM public.kennzahl_schreiben(v_tag, 'HR', 'bewerber_kein_interesse', v_zahl);
    v_geschrieben := v_geschrieben + 1;
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'HR.bewerber_kein_interesse uebersprungen: %', SQLERRM;
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

  /*
   * Leads aus Formular oder manueller Anlage. Gruppierung wortgleich aus
   * src/pages/Statistiken.tsx:573 (`isFormularManuell`): leere Quelle zaehlt
   * dazu, ebenso die sechs genannten Schreibweisen, verglichen wird in
   * Kleinschreibung ohne Rand-Leerzeichen.
   */
  BEGIN
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
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'MKT.leads_quelle_formular_manuell uebersprungen: %', SQLERRM;
  END;

  -- Alles Uebrige, also die benannten Plattformen und Kanaele.
  BEGIN
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
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'MKT.leads_quelle_plattform uebersprungen: %', SQLERRM;
  END;

  /*
   * Leads mit einer Kampagnenkennung. `meta.kampagne` ist ein Objekt mit den
   * sieben Feldern aus src/lib/kampagnenKennung.ts:79. Als "vorhanden" gilt
   * es, wenn mindestens eines davon gefuellt ist; das ist die Bedingung aus
   * `istLeer` (src/lib/kampagnenKennung.ts:98), die auch
   * `kampagneAusKontakt` (:230) anwendet.
   */
  BEGIN
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
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'MKT.leads_mit_kampagne uebersprungen: %', SQLERRM;
  END;

  /*
   * Leads mit ausgeschriebenem Kampagnennamen. `utm_campaign` ist die Ebene,
   * auf der Budget verteilt wird; die Auswertung gruppiert genau danach
   * (src/lib/kampagnenKennung.ts:212, benutzt in
   * src/components/statistiken/StatistikConversion.tsx:149).
   */
  BEGIN
    SELECT count(*) INTO v_zahl
      FROM public.kontakte k
     WHERE coalesce(k.archiviert, false) = false
       AND coalesce(k.geloescht, false) = false
       AND jsonb_typeof(k.meta->'kampagne') = 'object'
       AND coalesce(k.meta->'kampagne'->>'utmCampaign', '') <> '';
    PERFORM public.kennzahl_schreiben(v_tag, 'MKT', 'leads_mit_utm_campaign', v_zahl);
    v_geschrieben := v_geschrieben + 1;
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'MKT.leads_mit_utm_campaign uebersprungen: %', SQLERRM;
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
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'OBJ.objekte_gesamt uebersprungen: %', SQLERRM;
  END;

  BEGIN
    SELECT count(*) INTO v_zahl FROM public.objekte o WHERE coalesce(o.sichtbar, false) = true;
    PERFORM public.kennzahl_schreiben(v_tag, 'OBJ', 'objekte_sichtbar', v_zahl);
    v_geschrieben := v_geschrieben + 1;
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'OBJ.objekte_sichtbar uebersprungen: %', SQLERRM;
  END;

  BEGIN
    SELECT count(*) INTO v_zahl FROM public.wohnungen;
    PERFORM public.kennzahl_schreiben(v_tag, 'OBJ', 'wohneinheiten_gesamt', v_zahl);
    v_geschrieben := v_geschrieben + 1;
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'OBJ.wohneinheiten_gesamt uebersprungen: %', SQLERRM;
  END;

  BEGIN
    SELECT count(*) INTO v_zahl
      FROM public.wohnungen w
     WHERE lower(coalesce(w.status, '')) NOT IN ('reserviert', 'gesetzt', 'verkauft');
    PERFORM public.kennzahl_schreiben(v_tag, 'OBJ', 'wohneinheiten_frei', v_zahl);
    v_geschrieben := v_geschrieben + 1;
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'OBJ.wohneinheiten_frei uebersprungen: %', SQLERRM;
  END;

  BEGIN
    SELECT count(*) INTO v_zahl
      FROM public.wohnungen w
     WHERE lower(coalesce(w.status, '')) IN ('reserviert', 'gesetzt');
    PERFORM public.kennzahl_schreiben(v_tag, 'OBJ', 'wohneinheiten_reserviert', v_zahl);
    v_geschrieben := v_geschrieben + 1;
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'OBJ.wohneinheiten_reserviert uebersprungen: %', SQLERRM;
  END;

  BEGIN
    SELECT count(*) INTO v_zahl
      FROM public.wohnungen w
     WHERE lower(coalesce(w.status, '')) = 'verkauft';
    PERFORM public.kennzahl_schreiben(v_tag, 'OBJ', 'wohneinheiten_verkauft', v_zahl);
    v_geschrieben := v_geschrieben + 1;
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'OBJ.wohneinheiten_verkauft uebersprungen: %', SQLERRM;
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
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'BO.tickets_gesamt uebersprungen: %', SQLERRM;
  END;

  BEGIN
    SELECT count(*) INTO v_zahl FROM public.support_tickets t WHERE t.status = 'neu';
    PERFORM public.kennzahl_schreiben(v_tag, 'BO', 'tickets_neu', v_zahl);
    v_geschrieben := v_geschrieben + 1;
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'BO.tickets_neu uebersprungen: %', SQLERRM;
  END;

  BEGIN
    SELECT count(*) INTO v_zahl FROM public.support_tickets t WHERE t.status = 'offen';
    PERFORM public.kennzahl_schreiben(v_tag, 'BO', 'tickets_offen', v_zahl);
    v_geschrieben := v_geschrieben + 1;
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'BO.tickets_offen uebersprungen: %', SQLERRM;
  END;

  BEGIN
    SELECT count(*) INTO v_zahl FROM public.support_tickets t WHERE t.status = 'in_bearbeitung';
    PERFORM public.kennzahl_schreiben(v_tag, 'BO', 'tickets_in_bearbeitung', v_zahl);
    v_geschrieben := v_geschrieben + 1;
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'BO.tickets_in_bearbeitung uebersprungen: %', SQLERRM;
  END;

  -- "Erledigt" ist auf der Karte die Summe aus geloest und geschlossen
  -- (src/components/dashboard/HelpdeskCard.tsx:33).
  BEGIN
    SELECT count(*) INTO v_zahl
      FROM public.support_tickets t WHERE t.status IN ('geloest', 'geschlossen');
    PERFORM public.kennzahl_schreiben(v_tag, 'BO', 'tickets_erledigt', v_zahl);
    v_geschrieben := v_geschrieben + 1;
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'BO.tickets_erledigt uebersprungen: %', SQLERRM;
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

  -- Offene Reservierungen: unterschrieben, aber noch nicht beim Notar
  -- (src/lib/dashboardKpis.ts:113, Menge OFFENE_RESERVIERUNG). Hier wird
  -- bewusst die rohe Stufe kleingeschrieben verglichen, genau wie dort
  -- (src/lib/dashboardKpis.ts:200).
  BEGIN
    SELECT count(*) INTO v_zahl
      FROM public.kontakte k
     WHERE coalesce(k.archiviert, false) = false
       AND coalesce(k.geloescht, false) = false
       AND lower(coalesce(k.meta->>'pipelineStufe', '')) IN ('reservierung', 'finanzierung');
    PERFORM public.kennzahl_schreiben(v_tag, 'FIN', 'reservierungen_offen', v_zahl);
    v_geschrieben := v_geschrieben + 1;
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'FIN.reservierungen_offen uebersprungen: %', SQLERRM;
  END;

  -- Kunden, bei denen gerade die Bonitaetsunterlagen laufen. Die Stufe steht
  -- seit dem 06.08.2026 hinter der Reservierung
  -- (src/lib/pipelineStufen.ts:56 und die Begruendung bei den
  -- Wahrscheinlichkeiten, :96).
  BEGIN
    SELECT count(*) INTO v_zahl
      FROM public.kontakte k
     WHERE coalesce(k.archiviert, false) = false
       AND coalesce(k.geloescht, false) = false
       AND lower(coalesce(k.meta->>'pipelineStufe', '')) = 'bonitaetsunterlagen';
    PERFORM public.kennzahl_schreiben(v_tag, 'FIN', 'bonitaetsunterlagen', v_zahl);
    v_geschrieben := v_geschrieben + 1;
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'FIN.bonitaetsunterlagen uebersprungen: %', SQLERRM;
  END;

  -- Beim Notar (src/lib/abschlussDefinition.ts:17, erste Stufe der
  -- Abschlussdefinition).
  BEGIN
    SELECT count(*) INTO v_zahl
      FROM public.kontakte k
     WHERE coalesce(k.archiviert, false) = false
       AND coalesce(k.geloescht, false) = false
       AND lower(coalesce(k.meta->>'pipelineStufe', '')) = 'notar';
    PERFORM public.kennzahl_schreiben(v_tag, 'FIN', 'notar', v_zahl);
    v_geschrieben := v_geschrieben + 1;
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'FIN.notar uebersprungen: %', SQLERRM;
  END;

  -- Unterschriften, auf die noch gewartet wird. `pending` ist der Zustand
  -- einer offenen Anfrage
  -- (supabase/migrations/20260314155343_...sql:65, so gelesen auch in der
  -- Nachtpruefung, 20260807130000_nachtpruefung_pool_drei_tage.sql:52).
  BEGIN
    SELECT count(*) INTO v_zahl
      FROM public.signature_requests s
     WHERE s.status = 'pending' AND s.expires_at > now();
    PERFORM public.kennzahl_schreiben(v_tag, 'FIN', 'signaturen_offen', v_zahl);
    v_geschrieben := v_geschrieben + 1;
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'FIN.signaturen_offen uebersprungen: %', SQLERRM;
  END;

  -- Abgelaufene Unterschriften. Praedikat wortgleich aus der Nachtpruefung
  -- (supabase/migrations/20260805100000_nachtpruefung.sql:214), samt der
  -- dortigen Begrenzung auf die letzten 30 Tage.
  BEGIN
    SELECT count(*) INTO v_zahl
      FROM public.signature_requests s
     WHERE s.status = 'pending'
       AND s.expires_at < now()
       AND s.expires_at > now() - interval '30 days';
    PERFORM public.kennzahl_schreiben(v_tag, 'FIN', 'signaturen_abgelaufen', v_zahl);
    v_geschrieben := v_geschrieben + 1;
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'FIN.signaturen_abgelaufen uebersprungen: %', SQLERRM;
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
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'AS.empfehlungen_gesamt uebersprungen: %', SQLERRM;
  END;

  -- Frisch eingegangen, noch nicht angefasst (src/pages/Empfehlungen.tsx:175).
  BEGIN
    SELECT count(*) INTO v_zahl FROM public.empfehlungen e WHERE coalesce(e.status, 'offen') = 'neu';
    PERFORM public.kennzahl_schreiben(v_tag, 'AS', 'empfehlungen_neu', v_zahl);
    v_geschrieben := v_geschrieben + 1;
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'AS.empfehlungen_neu uebersprungen: %', SQLERRM;
  END;

  -- Zum Abschluss gekommen (src/pages/Empfehlungen.tsx:223).
  BEGIN
    SELECT count(*) INTO v_zahl FROM public.empfehlungen e WHERE e.status = 'abgeschlossen';
    PERFORM public.kennzahl_schreiben(v_tag, 'AS', 'empfehlungen_abgeschlossen', v_zahl);
    v_geschrieben := v_geschrieben + 1;
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'AS.empfehlungen_abgeschlossen uebersprungen: %', SQLERRM;
  END;

  BEGIN
    SELECT count(*) INTO v_zahl FROM public.tippgeber;
    PERFORM public.kennzahl_schreiben(v_tag, 'AS', 'tippgeber_gesamt', v_zahl);
    v_geschrieben := v_geschrieben + 1;
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'AS.tippgeber_gesamt uebersprungen: %', SQLERRM;
  END;

  -- Abgegebene Partnerbewertungen (src/pages/VpBewertungen.tsx:54 rechnet
  -- den Mittelwert ueber genau diese Zeilen).
  BEGIN
    SELECT count(*) INTO v_zahl FROM public.vp_bewertungen;
    PERFORM public.kennzahl_schreiben(v_tag, 'AS', 'vp_bewertungen_gesamt', v_zahl);
    v_geschrieben := v_geschrieben + 1;
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'AS.vp_bewertungen_gesamt uebersprungen: %', SQLERRM;
  END;

  -- Kundenbewertungen (src/lib/statistikenHelper.ts:403).
  BEGIN
    SELECT count(*) INTO v_zahl FROM public.kunden_bewertungen;
    PERFORM public.kennzahl_schreiben(v_tag, 'AS', 'kunden_bewertungen_gesamt', v_zahl);
    v_geschrieben := v_geschrieben + 1;
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'AS.kunden_bewertungen_gesamt uebersprungen: %', SQLERRM;
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
  --
  -- Beide Tabellen stehen hinter einer Pruefung mit `to_regclass`. Fehlt eine
  -- von ihnen, werden ihre Kennzahlen still uebersprungen, ohne Fehlermeldung
  -- und ohne Null, die wie ein Messwert aussieht.

  IF to_regclass('public.va_partner_fortschritt') IS NOT NULL THEN
    BEGIN
      SELECT count(DISTINCT f.user_id) INTO v_zahl FROM public.va_partner_fortschritt f;
      PERFORM public.kennzahl_schreiben(v_tag, 'VA', 'partner_mit_fortschritt', v_zahl);
      v_geschrieben := v_geschrieben + 1;
    EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'VA.partner_mit_fortschritt uebersprungen: %', SQLERRM;
    END;

    BEGIN
      SELECT count(*) INTO v_zahl
        FROM public.va_partner_fortschritt f WHERE f.kapitel_abgeschlossen = true;
      PERFORM public.kennzahl_schreiben(v_tag, 'VA', 'kapitel_abgeschlossen', v_zahl);
      v_geschrieben := v_geschrieben + 1;
    EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'VA.kapitel_abgeschlossen uebersprungen: %', SQLERRM;
    END;
  ELSE
    RAISE NOTICE 'VA: va_partner_fortschritt gibt es in dieser Datenbank nicht, zwei Kennzahlen ausgelassen.';
  END IF;

  -- Diese Tabelle fehlt in der Datenbank der GL (Stand 09.09.2026). Die
  -- Migration 20260727080000_va_aufgaben_ergebnisse.sql steht im Repo, ist
  -- aber nie im SQL-Editor gelaufen.
  IF to_regclass('public.va_aufgaben_ergebnisse') IS NOT NULL THEN
    BEGIN
      SELECT count(*) INTO v_zahl
        FROM public.va_aufgaben_ergebnisse a WHERE a.geloest = true;
      PERFORM public.kennzahl_schreiben(v_tag, 'VA', 'aufgaben_geloest', v_zahl);
      v_geschrieben := v_geschrieben + 1;
    EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'VA.aufgaben_geloest uebersprungen: %', SQLERRM;
    END;
  ELSE
    RAISE NOTICE 'VA: va_aufgaben_ergebnisse gibt es in dieser Datenbank nicht, Kennzahl aufgaben_geloest ausgelassen.';
  END IF;

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
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'CTR.abrechnungen_gesamt uebersprungen: %', SQLERRM;
  END;

  -- Die drei Zustaende sind in der Tabelle selbst festgeschrieben
  -- (supabase/migrations/20260729080000_abrechnung_sichtbar_und_dauerhaft.sql:38),
  -- gelesen in src/lib/provisionsAbrechnungStore.ts:103.
  BEGIN
    SELECT count(*) INTO v_zahl FROM public.provisionsabrechnungen a WHERE a.status = 'offen';
    PERFORM public.kennzahl_schreiben(v_tag, 'CTR', 'abrechnungen_offen', v_zahl);
    v_geschrieben := v_geschrieben + 1;
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'CTR.abrechnungen_offen uebersprungen: %', SQLERRM;
  END;

  BEGIN
    SELECT count(*) INTO v_zahl FROM public.provisionsabrechnungen a WHERE a.status = 'freigegeben';
    PERFORM public.kennzahl_schreiben(v_tag, 'CTR', 'abrechnungen_freigegeben', v_zahl);
    v_geschrieben := v_geschrieben + 1;
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'CTR.abrechnungen_freigegeben uebersprungen: %', SQLERRM;
  END;

  BEGIN
    SELECT count(*) INTO v_zahl FROM public.provisionsabrechnungen a WHERE a.status = 'ausgezahlt';
    PERFORM public.kennzahl_schreiben(v_tag, 'CTR', 'abrechnungen_ausgezahlt', v_zahl);
    v_geschrieben := v_geschrieben + 1;
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'CTR.abrechnungen_ausgezahlt uebersprungen: %', SQLERRM;
  END;

  RETURN v_geschrieben;
END;
$$;

REVOKE ALL ON FUNCTION public.kennzahlen_tagesstand_lauf() FROM anon, authenticated;

COMMENT ON FUNCTION public.kennzahlen_tagesstand_lauf() IS
  'Schreibt den Tagesstand der Kennzahlen je Bereich. Wird naechtlich von '
  'pg_cron gerufen. Ein zweiter Lauf am selben Tag ersetzt die Werte. Jede '
  'einzelne Kennzahl hat ihren eigenen Fehlerabfang, ein Ausfall reisst weder '
  'ihre Nachbarn noch den Bereich mit. Der Rueckgabewert zaehlt nur, was '
  'wirklich geschrieben wurde.';

-- ---------------------------------------------------------------------------
-- Einmal laufen lassen und nachsehen
-- ---------------------------------------------------------------------------
--
-- Die erste Abfrage gibt die Zahl der geschriebenen Kennzahlen zurueck.
-- Erwartet werden 56, oder 55, solange `va_aufgaben_ergebnisse` fehlt. Die
-- zweite zeigt die Verteilung je Bereich: AGL 5, OPS 6, VL 6, HR 6, MKT 4,
-- OBJ 6, BO 5, FIN 5, AS 6, VA 3, CTR 4. Bleibt irgendwo eine Zahl darunter,
-- nennt die zugehoerige NOTICE-Meldung im Editor den Grund.

SELECT public.kennzahlen_tagesstand_lauf() AS geschriebene_kennzahlen;

SELECT bereich, count(*) AS kennzahlen
  FROM public.kennzahlen_tagesstand
 WHERE stichtag = (now() AT TIME ZONE 'Europe/Berlin')::date
 GROUP BY bereich
 ORDER BY bereich;
