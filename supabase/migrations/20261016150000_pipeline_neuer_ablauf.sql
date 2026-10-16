-- ===========================================================================
-- Pipeline nach dem neuen Ablauf (16.10.2026)
-- ===========================================================================
--
-- Umsetzungsstrategie Vertrieb, Abschnitt 3, freigegeben von Christian.
-- Die Schluessel der Stufen bleiben, neu sind zwei Stufen zwischen
-- Reservierung und Finanzierung:
--
--   ... reservierung, besichtigung, bankgutachter, finanzierung, notar ...
--
-- "bonitaetsunterlagen" ist ausgeblendet: Die Unterlagen kommen jetzt vor die
-- Objektvorstellung. Laufende Faelle behalten die Stufe (Entscheidung Frage 3)
-- und stehen im Rang der Reservierung. So rueckt ein Bestandsfall ueber die
-- Besichtigung weiter und faellt nicht zurueck.
--
-- Die Stufe steht in investments.meta / kontakte.meta (jsonb). Eine
-- CHECK-Regel oder ein Enum auf die Stufenwerte gibt es nicht, deshalb ist
-- dort nichts zu erweitern. Nachgezogen werden die Funktionen, die Stufen
-- aufzaehlen:
--
--   1. buchung_pipeline_rang         (Rangfolge, Gleichlauf: buchungPipelineRang.test.ts)
--   2. pipelinestufe_ist_kaufphase   (Provisionssatz ab Reservierung)
--   3. finanzierung_intern_frei_meta (Finanzierung ab unterschriebener Reservierung)
--   4. notify_vp_on_investment_stufe (Anzeigenamen in der Glocke)
--   5. kennzahl_stufe, kennzahl_wahrscheinlichkeit, kennzahl_schwelle_rot,
--      kennzahl_schwelle_final       (Kennzahlen, Kopien der Tabellen im Browser)
--
-- Ohne 1 bis 3 faellt ein Investment auf "besichtigung" oder "bankgutachter"
-- aus der Kaufphase: kein Provisionssatz, Finanzierung gesperrt, und
-- pipeline_stufe_normalisieren macht die Stufe zu NULL.
--
-- Aendert keine Daten, wiederholbar (nur CREATE OR REPLACE), keine Function
-- auszurollen. Reihenfolge zu anderen Migrationen egal.
-- ===========================================================================

-- ── 1. Rangfolge ────────────────────────────────────────────────────────────
-- Muss mit PIPELINE_STUFEN in src/lib/pipelineStufen.ts uebereinstimmen, das
-- prueft buchungPipelineRang.test.ts.
CREATE OR REPLACE FUNCTION public.buchung_pipeline_rang(_stufe text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE lower(btrim(COALESCE(_stufe, '')))
    WHEN 'neuer_lead'            THEN 0
    WHEN 'nicht_erreicht'        THEN 1
    WHEN 'erreicht'              THEN 2
    WHEN 'follow_up'             THEN 3
    WHEN 'erstgespraech_geplant' THEN 4
    -- Altdaten: dieselbe Stufe, nur die alte Schreibweise.
    WHEN 'erstgespraech'         THEN 4
    WHEN 'eg_noshow'             THEN 5
    WHEN 'beratungsgespraech'    THEN 6
    WHEN 'bg_noshow'             THEN 7
    WHEN 'selbstauskunft'        THEN 8
    WHEN 'objektauswahl'         THEN 9
    WHEN 'follow_up_objekt'      THEN 10
    WHEN 'reservierung'          THEN 11
    -- Ausgeblendet seit 16.10.2026: Rang der Reservierung.
    WHEN 'bonitaetsunterlagen'   THEN 11
    WHEN 'besichtigung'          THEN 12
    WHEN 'bankgutachter'         THEN 13
    WHEN 'finanzierung'          THEN 14
    WHEN 'notar'                 THEN 15
    WHEN 'faelligkeit'           THEN 16
    WHEN 'abrechnung'            THEN 17
    WHEN 'abgeschlossen'         THEN 18
    WHEN 'bestandsimport'        THEN 19
    WHEN 'archiviert'            THEN 20
    WHEN 'verloren'              THEN 21
    -- Legacy-Aliase auf ihre heutige Entsprechung.
    WHEN 'zugewiesen'            THEN 0
    WHEN 'kontaktversuche'       THEN 2
    WHEN 'vermoegensaufbau'      THEN 3
    ELSE -1
  END;
$$;

COMMENT ON FUNCTION public.buchung_pipeline_rang(text) IS
  'Rang einer Pipelinestufe. Muss mit PIPELINE_STUFEN in src/lib/pipelineStufen.ts '
  'uebereinstimmen, das prueft buchungPipelineRang.test.ts. Seit 16.10.2026 mit '
  'besichtigung und bankgutachter; bonitaetsunterlagen teilt den Rang der Reservierung.';

-- ── 2. Kaufphase (Provisionssatz) ───────────────────────────────────────────
-- Abbild von PIPELINE_STUFEN, alles ab "reservierung" bis "abgeschlossen".
-- src/lib/provisionssatzAbReservierungMigration.test.ts prueft die Liste.
CREATE OR REPLACE FUNCTION public.pipelinestufe_ist_kaufphase(_stufe text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT coalesce(_stufe, '') IN (
    'reservierung', 'bonitaetsunterlagen', 'besichtigung', 'bankgutachter', 'finanzierung', 'notar',
    'faelligkeit', 'abrechnung', 'abgeschlossen'
  );
$$;

COMMENT ON FUNCTION public.pipelinestufe_ist_kaufphase(text) IS
  'true ab Reservierung bis Abgeschlossen. Abbild von PIPELINE_STUFEN in '
  'src/lib/pipelineStufen.ts; ab hier wird der Provisionssatz festgeschrieben.';

-- ── 3. Finanzierung intern frei ─────────────────────────────────────────────
-- Gegenstueck zu FREIGESCHALTET_AB_RESERVIERUNG in
-- src/lib/investmentFreischaltung.ts, geprueft in finanzierungInternMigration.test.ts.
CREATE OR REPLACE FUNCTION public.finanzierung_intern_frei_meta(_meta jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT COALESCE(_meta ->> 'rvSigned', 'false') = 'true'
     AND COALESCE(_meta ->> 'pipelineStufe', '') IN (
           'reservierung', 'bonitaetsunterlagen', 'besichtigung', 'bankgutachter', 'finanzierung', 'notar',
           'faelligkeit', 'abrechnung', 'abgeschlossen'
         )
$$;

COMMENT ON FUNCTION public.finanzierung_intern_frei_meta(jsonb) IS
  'Ist die Finanzierung nach diesem investments.meta intern offen? '
  'Reservierung unterschrieben und Stufe ab Reservierung. Gegenstueck zu '
  'finanzierungIntern im Frontend, ohne die Objektpruefung.';

-- ── 4. Glocke "Pipeline-Stufe geaendert" mit den neuen Namen ────────────────
-- Unveraendert bis auf die Anzeigenamen (wie PIPELINE_STUFEN).
CREATE OR REPLACE FUNCTION public.notify_vp_on_investment_stufe()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _alt text := COALESCE(public.pipeline_stufe_normalisieren(OLD.meta->>'pipelineStufe'), '');
  _neu text := COALESCE(public.pipeline_stufe_normalisieren(NEW.meta->>'pipelineStufe'), '');
  _kontakt record;
  _label text;
  _actor uuid := auth.uid();
BEGIN
  IF _neu = _alt OR _neu = '' THEN
    RETURN NEW;
  END IF;

  SELECT id, zustaendig_id, vorname, nachname INTO _kontakt
  FROM public.kontakte WHERE id = NEW.kunde_id;
  IF _kontakt.zustaendig_id IS NULL THEN
    RETURN NEW;
  END IF;
  -- Der Partner hat die Aenderung selbst gemacht: keine Selbst-Benachrichtigung.
  IF _actor IS NOT NULL AND _actor = _kontakt.zustaendig_id THEN
    RETURN NEW;
  END IF;

  _label := CASE _neu
    WHEN 'neuer_lead' THEN 'Neuer Lead'
    WHEN 'zugewiesen' THEN 'Zugewiesen'
    WHEN 'kontaktversuche' THEN 'Kontaktversuche'
    WHEN 'nicht_erreicht' THEN 'Nicht erreicht'
    WHEN 'erreicht' THEN 'Erreicht'
    WHEN 'follow_up' THEN 'Follow-Up'
    WHEN 'erstgespraech_geplant' THEN 'Erstgespräch'
    WHEN 'eg_noshow' THEN 'EG NoShow'
    WHEN 'beratungsgespraech' THEN 'Beratungspräsentation'
    WHEN 'bg_noshow' THEN 'BP NoShow'
    WHEN 'selbstauskunft' THEN 'Selbstauskunft & Unterlagen'
    WHEN 'objektauswahl' THEN 'Objektvorstellung'
    WHEN 'follow_up_objekt' THEN 'Follow-Up'
    WHEN 'reservierung' THEN 'Reservierung'
    WHEN 'bonitaetsunterlagen' THEN 'Bonitätsunterlagen'
    WHEN 'besichtigung' THEN 'Besichtigung'
    WHEN 'bankgutachter' THEN 'Termin Bankgutachter'
    WHEN 'finanzierung' THEN 'Finanzierung'
    WHEN 'notar' THEN 'Notar'
    WHEN 'faelligkeit' THEN 'Kaufpreisfälligkeit'
    WHEN 'abrechnung' THEN 'Abrechnung'
    WHEN 'abgeschlossen' THEN 'Abgeschlossen'
    WHEN 'bestandsimport' THEN 'Bestandskunden Import'
    WHEN 'verloren' THEN 'Verloren'
    WHEN 'archiviert' THEN 'Archiviert'
    ELSE _neu
  END;

  INSERT INTO public.benachrichtigungen (benutzer_id, titel, nachricht, link, gelesen)
  VALUES (
    _kontakt.zustaendig_id,
    'Pipeline-Stufe geändert: ' || _label,
    trim(COALESCE(_kontakt.vorname, '') || ' ' || COALESCE(_kontakt.nachname, ''))
      || ' (' || COALESCE(NULLIF(NEW.meta->>'label', ''), 'Investment ' || COALESCE(NEW.meta->>'nummer', '?'))
      || ') wurde auf Stufe „' || _label || '" verschoben.',
    '/kunden/' || NEW.kunde_id::text || '?investment=' || NEW.id::text,
    false
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_vp_on_investment_stufe() FROM PUBLIC, anon, authenticated;

-- ── 5. Kennzahlen ───────────────────────────────────────────────────────────
-- Wie normalizeStufe in src/lib/statistikTrichter.ts: Die ausgeblendete Stufe
-- zaehlt zur Reservierung.
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
    WHEN _roh = 'bonitaetsunterlagen'       THEN 'reservierung'
    WHEN _roh = 'zugewiesen'                THEN 'neuer_lead'
    WHEN _roh = 'kontaktversuche'           THEN 'nicht_erreicht'
    WHEN _roh = 'vermoegensaufbau'          THEN 'erreicht'
    ELSE _roh
  END;
$$;

COMMENT ON FUNCTION public.kennzahl_stufe(text) IS
  'Pipelinestufe wie in src/lib/statistikTrichter.ts (normalizeStufe). '
  'Nur fuer die Kennzahlen gedacht, aendert nichts an gespeicherten Daten.';

-- Kopie von STUFEN_WAHRSCHEINLICHKEIT in src/lib/pipelineStufen.ts.
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
    WHEN 'bonitaetsunterlagen'   THEN 0.60
    WHEN 'besichtigung'          THEN 0.70
    WHEN 'bankgutachter'         THEN 0.75
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
  'in src/lib/pipelineStufen.ts. Unbekannte Stufe: NULL.';

-- Kopie der Rot-Schwelle aus INACTIVITY_THRESHOLDS (src/lib/inactivityThresholds.ts).
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
    WHEN 'besichtigung'          THEN 10
    WHEN 'bankgutachter'         THEN 14
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
  'INAKTIVITAETS_SCHWELLEN, src/lib/inactivityThresholds.ts und '
  'supabase/functions/_shared/pipeline-schwellen.ts. NULL = nicht ueberwacht.';

-- Kopie von FINALE_SCHWELLEN (supabase/functions/_shared/pipeline-schwellen.ts).
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
    WHEN 'besichtigung'          THEN 14
    WHEN 'bankgutachter'         THEN 21
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
  'Kopie von FINALE_SCHWELLEN, supabase/functions/_shared/pipeline-schwellen.ts.';
