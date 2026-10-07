-- ===========================================================================
-- Provisionssatz-Trigger reparieren: falscher Typvergleich, stiller Ausfall
-- ===========================================================================
--
-- WAS AM 09.09.2026 GEMESSEN WURDE
--
-- Der Trigger `trg_investments_provisionssatz_festschreiben` aus
-- 20260818140000_provisionssatz_serverseitig_festschreiben.sql soll beim
-- Anlegen eines Investments den Provisionssatz serverseitig einfrieren. In
-- Christians Datenbank gezaehlt:
--
--   2095 Investments seit dem 18.08.2026
--   davon mit meta->>'lockedProvisionRateQuelle' = 'serverseitig': 0
--
-- Der Trigger hat also seit dem ersten Tag bei JEDEM Aufruf versagt.
--
-- URSACHE
--
-- Zeile 261 der alten Datei:
--
--     WHERE k.id::text = NEW.kunde_id
--
-- `investments.kunde_id` ist seit 20260517094425 eine `uuid` mit
-- Fremdschluessel auf `kontakte(id)`, `kontakte.id` ebenfalls. Der Vergleich
-- lautet damit `text = uuid`. Fuer diese Kombination kennt Postgres keinen
-- Operator, die Abfrage bricht mit 42883 ab, noch bevor irgendetwas berechnet
-- wird. Genau derselbe Fehler steckte im Kennzahlenlauf und ist dort am
-- 09.09.2026 mit 20260909090000_kennzahlen_lauf_reparatur.sql behoben worden.
--
-- Zeile 268 (`public.investment_partner_id(NEW.kunde_id)`) ist dagegen in
-- Ordnung: Die Funktion wurde am 18.08.2026 mit
-- 20260818150000_investment_partner_id_uuid.sql von `text` auf `uuid`
-- umgestellt, die text-Fassung dabei geloescht. Der Aufruf haette also
-- gepasst, er wurde nur nie erreicht.
--
-- WARUM ES SECHS WOCHEN NIEMAND GEMERKT HAT
--
-- Der `EXCEPTION WHEN OTHERS` in Zeile 302 faengt den Abbruch ab und schreibt
-- eine `RAISE WARNING`. Die landet im Postgres-Protokoll, das im Alltag
-- niemand liest. In den Daten war der Ausfall unsichtbar: kein Satz, kein
-- Vermerk, kein Unterschied zu einem Investment, bei dem es nichts zu
-- schreiben gab.
--
-- WAS DIESE MIGRATION AENDERT
--
--   a) Der Vergleich steht jetzt als uuid gegen uuid (`k.id = NEW.kunde_id`).
--      Nebenbei greift so auch der Primaerschluessel-Index, die Begruendung
--      aus 20260827210000_kontaktpruefung_ohne_textcast.sql.
--
--   b) `investment_partner_id` wird als uuid-Fassung noch einmal sicher
--      hingestellt (gleicher Inhalt wie 20260818150000, `k.id = _kunde_id`
--      statt `k.id::text = _kunde_id`), und eine eventuell noch vorhandene
--      text-Fassung wird entfernt. Zwei Fassungen nebeneinander sollen gar
--      nicht erst entstehen: Bei `analysetool_trichter` hat eine mehrdeutige
--      Funktion schon einmal zum Abbruch gefuehrt. Am Ende prueft ein
--      Wachposten, dass genau eine Fassung dasteht.
--
--   c) Der Fehlerabfang bleibt, aber er wird sichtbar. Der Satz "Ein Fehler
--      hier darf NIE das Anlegen eines Investments verhindern" gilt weiter.
--      Neu ist: Jeder Fehlschlag hinterlaesst im `meta` des Investments einen
--      Vermerk unter `lockedProvisionRateFehler` mit Zeitpunkt, Grund und
--      (bei einer Ausnahme) Meldung und SQLSTATE. Damit steht der Ausfall in
--      den Daten und ist abfragbar, statt nur in einem Protokoll zu stehen.
--      Vermerkt werden auch die stillen Aussteige, bei denen bisher einfach
--      `RETURN NEW` stand: kein Kontakt, kein zustaendiger Partner, kein
--      ermittelbarer Satz.
--
-- Die alte Datei 20260818140000 bleibt unangetastet, damit die Historie
-- zeigt, was war. Diese Migration ist mehrfach ausfuehrbar.
--
-- NICHT Teil dieser Migration: eine Korrektur der Altdaten. Ob und wie die
-- 2095 Investments seit dem 18.08.2026 nachtraeglich einen Satz bekommen,
-- entscheidet Christian. Die Zahlen dafuer liefert
-- supabase/migrations-inbox/97_PROVISIONSSAETZE_PRUEFEN.sql, sie aendert
-- nichts.

-- ---------------------------------------------------------------------------
-- 1) Voraussetzungen
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regprocedure('public.provisionssatz_fuer_partner(uuid,boolean)') IS NULL
     OR to_regclass('public.karriere_stufen') IS NULL THEN
    RAISE EXCEPTION
      'Zuerst 20260818140000_provisionssatz_serverseitig_festschreiben.sql ausfuehren, diese Migration setzt darauf auf.';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2) Zustaendiger Partner eines Investments, uuid gegen uuid
-- ---------------------------------------------------------------------------
--
-- Inhaltlich unveraendert gegenueber 20260818150000. Die Datei steht hier
-- noch einmal, damit die Reparatur auch dann vollstaendig ist, wenn jene
-- Migration in einer Datenbank nie gelaufen sein sollte. Die text-Fassung
-- aus 20260818140000 wird vorher entfernt, sonst stuenden zwei Funktionen
-- gleichen Namens da.

DROP FUNCTION IF EXISTS public.investment_partner_id(text);

CREATE OR REPLACE FUNCTION public.investment_partner_id(_kunde_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _berater text;
  _zustaendig uuid;
  _partner uuid;
BEGIN
  IF _kunde_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- uuid gegen uuid: so greift der Primaerschluessel-Index.
  SELECT k.berater, k.zustaendig_id
    INTO _berater, _zustaendig
    FROM public.kontakte k
   WHERE k.id = _kunde_id
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF coalesce(trim(_berater), '') <> '' THEN
    SELECT p.id INTO _partner FROM public.profiles p WHERE p.name = _berater LIMIT 1;
    IF _partner IS NOT NULL THEN
      RETURN _partner;
    END IF;
  END IF;

  RETURN _zustaendig;
END;
$$;

COMMENT ON FUNCTION public.investment_partner_id(uuid) IS
  'Zustaendiger Vertriebspartner zu einer investments.kunde_id: erst der '
  'Berater-Name gegen profiles.name, dann kontakte.zustaendig_id. Parameter '
  'ist uuid, damit der Primaerschluessel-Index greift.';

-- ---------------------------------------------------------------------------
-- 3) Der Trigger
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.investments_provisionssatz_festschreiben()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _kontakt record;
  _partner uuid;
  _eigen boolean := false;
  _setter text;
  _ersteller_id text;
  _ersteller_name text;
  _berater_name text;
  _rate numeric;
  _jetzt text := to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  _grund text;
  _meldung text;
  _code text;
BEGIN
  -- Aeusseres Sicherheitsnetz: Ein Fehler hier darf NIE das Anlegen eines
  -- Investments verhindern. Neu ist nur, dass er nicht mehr spurlos bleibt.
  BEGIN

    -- Ermittlung. Was hier schiefgeht, wird zu einem Grund, nicht zu einem
    -- Abbruch.
    BEGIN
      -- HIER LAG DER FEHLER: `k.id::text = NEW.kunde_id` verglich Text mit
      -- uuid. Beide Seiten sind uuid, der Cast war falsch und teuer zugleich.
      SELECT k.zustaendig_id, k.berater, coalesce(k.meta, '{}'::jsonb) AS meta
        INTO _kontakt
        FROM public.kontakte k
       WHERE k.id = NEW.kunde_id
       LIMIT 1;

      IF NOT FOUND THEN
        _grund := 'kontakt_nicht_gefunden';
      ELSE
        _partner := public.investment_partner_id(NEW.kunde_id);

        IF _partner IS NULL THEN
          _grund := 'kein_zustaendiger_partner';
        ELSE
          -- Eigen oder zugewiesen? Spiegel von istEigenKontakt im Frontend:
          -- ein eingetragener Setter bedeutet immer zugewiesen; sonst zaehlt,
          -- wer den Kontakt angelegt hat (erstelltVonId, notfalls der Name);
          -- ohne beides gilt die vorsichtigere Annahme "zugewiesen".
          _setter := nullif(trim(coalesce(_kontakt.meta ->> 'setter', '')), '');
          IF _setter IS NOT NULL THEN
            _eigen := false;
          ELSE
            _ersteller_id := nullif(trim(coalesce(_kontakt.meta ->> 'erstelltVonId', '')), '');
            IF _ersteller_id IS NOT NULL THEN
              _eigen := (_ersteller_id = _partner::text);
            ELSE
              _ersteller_name := lower(trim(coalesce(_kontakt.meta ->> 'erstelltVonName', '')));
              _berater_name := lower(trim(coalesce(_kontakt.berater, '')));
              _eigen := _ersteller_name <> '' AND _berater_name <> '' AND _ersteller_name = _berater_name;
            END IF;
          END IF;

          _rate := public.provisionssatz_fuer_partner(_partner, _eigen);
          IF _rate IS NULL OR _rate <= 0 THEN
            _grund := 'kein_satz_ermittelbar';
          END IF;
        END IF;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      _grund := 'ausnahme';
      _meldung := SQLERRM;
      _code := SQLSTATE;
      RAISE WARNING 'Provisionssatz konnte fuer Investment % nicht festgeschrieben werden: % (%)',
        NEW.id, SQLERRM, SQLSTATE;
    END;

    IF _grund IS NULL THEN
      -- Der Server ist die einzige Wahrheit: ein eventuell vom Client
      -- mitgeschickter Wert wird ueberschrieben. Ein alter Fehlervermerk
      -- faellt dabei weg, sonst behauptete er weiter einen Ausfall.
      NEW.meta := (coalesce(NEW.meta, '{}'::jsonb) - 'lockedProvisionRateFehler')
        || jsonb_build_object(
             'lockedProvisionRate', _rate,
             'lockedProvisionRateAt', _jetzt,
             'lockedProvisionRateQuelle', 'serverseitig'
           );
    ELSE
      -- Der Ausfall steht ab jetzt in den Daten. Ohne diesen Vermerk sieht ein
      -- fehlgeschlagener Trigger genauso aus wie ein Investment, bei dem es
      -- nichts festzuschreiben gab. Genau das hat den Ausfall seit dem
      -- 18.08.2026 verdeckt.
      NEW.meta := coalesce(NEW.meta, '{}'::jsonb) || jsonb_build_object(
        'lockedProvisionRateFehler', jsonb_strip_nulls(jsonb_build_object(
          'zeitpunkt', _jetzt,
          'grund', _grund,
          'meldung', _meldung,
          'code', _code
        ))
      );
    END IF;

  EXCEPTION WHEN OTHERS THEN
    -- Selbst das Schreiben des Vermerks darf das Anlegen nicht kosten.
    RAISE WARNING 'Provisionsvermerk konnte fuer Investment % nicht gesetzt werden: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.investments_provisionssatz_festschreiben() IS
  'BEFORE-INSERT-Trigger auf investments: schreibt den Provisionssatz des '
  'zustaendigen Partners serverseitig in meta fest. Schlaegt das fehl, wird '
  'der Grund unter meta->lockedProvisionRateFehler vermerkt; das Anlegen des '
  'Investments geht in jedem Fall durch.';

DROP TRIGGER IF EXISTS trg_investments_provisionssatz_festschreiben ON public.investments;
CREATE TRIGGER trg_investments_provisionssatz_festschreiben
BEFORE INSERT ON public.investments
FOR EACH ROW
EXECUTE FUNCTION public.investments_provisionssatz_festschreiben();

-- ---------------------------------------------------------------------------
-- 4) Rechte, unveraendert zu 20260818140000
-- ---------------------------------------------------------------------------
--
-- investment_partner_id und provisionssatz_fuer_partner lesen als
-- SECURITY DEFINER an RLS vorbei fremde user_settings. Ein beliebiger
-- Angemeldeter koennte damit die Provisionssaetze aller Partner abfragen.
-- Deshalb: nur der Server (Trigger laeuft als Tabellenbesitzer) und
-- service_role duerfen sie rufen.

REVOKE ALL ON FUNCTION public.investment_partner_id(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.investment_partner_id(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.investments_provisionssatz_festschreiben() FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5) Wachposten: genau eine Fassung von investment_partner_id
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  _anzahl integer;
BEGIN
  SELECT count(*) INTO _anzahl
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'investment_partner_id';

  IF _anzahl <> 1 THEN
    RAISE EXCEPTION
      'investment_partner_id existiert % mal. Genau eine Fassung (uuid) darf dastehen, sonst ist der Aufruf mehrdeutig.',
      _anzahl;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 6) Nachsehen, ob es jetzt greift
-- ---------------------------------------------------------------------------
--
-- Die Abfrage zaehlt die Investments seit dem 18.08.2026, dem Tag, an dem der
-- Trigger eingebaut wurde. Sie aendert nichts.
--
-- Direkt nach dieser Migration ist der erwartete Stand: `serverseitig` = 0,
-- `mit_fehlervermerk` = 0, denn beide entstehen erst beim naechsten INSERT.
-- Der Beleg, dass die Reparatur greift, ist das naechste angelegte
-- Investment: Danach muss `serverseitig` mindestens 1 sein. Wer nicht warten
-- will, legt in der Oberflaeche ein Testinvestment an und laesst die Abfrage
-- noch einmal laufen.
--
-- `ohne_satz` ist der Altbestand aus den sechs Wochen. Wie er sich verteilt
-- und wo ein falscher Satz aus dem Browser steht, beantwortet
-- supabase/migrations-inbox/97_PROVISIONSSAETZE_PRUEFEN.sql.

SELECT
  count(*)                                                                        AS investments_seit_18_08,
  count(*) FILTER (WHERE i.meta ->> 'lockedProvisionRateQuelle' = 'serverseitig')  AS serverseitig,
  count(*) FILTER (WHERE i.meta ? 'lockedProvisionRateFehler')                     AS mit_fehlervermerk,
  count(*) FILTER (WHERE jsonb_typeof(i.meta -> 'lockedProvisionRate') = 'number') AS mit_satz,
  count(*) FILTER (WHERE jsonb_typeof(i.meta -> 'lockedProvisionRate') <> 'number'
                      OR i.meta -> 'lockedProvisionRate' IS NULL)                  AS ohne_satz
  FROM public.investments i
 WHERE i.erstellt_am >= timestamptz '2026-08-18 00:00:00+02';
