-- ===========================================================================
-- Pipeline: Finanzierung vor Bankgutachter und Besichtigung (16.10.2026)
-- ===========================================================================
--
-- Vorgabe Christian (zweite Fassung des Ablaufs). Nach der Reservierung:
--
--   ... reservierung, finanzierung, bankgutachter, besichtigung, notar ...
--
-- "Vor Besichtigung ist Finanzierung", der Gutachter der Bank meldet sich
-- nach genehmigter Bonitaet, besichtigt wird am Notartag oder am Vortag.
-- Dazu neue Anzeigenamen: Qualifizierungsgespraech (statt Erstgespraech) und
-- Objektpraesentation / Closing (statt Objektvorstellung). Die Schluessel
-- bleiben.
--
-- Nachgezogen werden nur die Funktionen, die die Reihenfolge, die Namen oder
-- die Werte je Stufe kennen (Gleichlauf mit src/lib/pipelineStufen.ts,
-- src/lib/inactivityThresholds.ts, supabase/functions/_shared/pipeline-schwellen.ts):
--
--   1. buchung_pipeline_rang         (Rang 12 finanzierung, 13 bankgutachter, 14 besichtigung)
--   2. notify_vp_on_investment_stufe (Anzeigenamen in der Glocke)
--   3. kennzahl_wahrscheinlichkeit, kennzahl_schwelle_rot, kennzahl_schwelle_final
--   4. pipelinestufe_ist_kaufphase, finanzierung_intern_frei_meta: dieselbe
--      Menge wie bisher, nur in der neuen Reihenfolge aufgezaehlt (die Tests
--      vergleichen die Liste mit PIPELINE_STUFEN). Ergebnis unveraendert.
--
-- Aendert keine Daten, wiederholbar (nur CREATE OR REPLACE), keine Function
-- auszurollen.
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
    WHEN 'finanzierung'          THEN 12
    WHEN 'bankgutachter'         THEN 13
    WHEN 'besichtigung'          THEN 14
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
  'Reihenfolge nach der Reservierung: finanzierung, bankgutachter, besichtigung, notar; '
  'bonitaetsunterlagen teilt den Rang der Reservierung.';

-- ── 2. Glocke "Pipeline-Stufe geaendert" mit den neuen Namen ────────────────
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
    WHEN 'erstgespraech_geplant' THEN 'Qualifizierungsgespräch'
    WHEN 'eg_noshow' THEN 'QG NoShow'
    WHEN 'beratungsgespraech' THEN 'Beratungspräsentation'
    WHEN 'bg_noshow' THEN 'BP NoShow'
    WHEN 'selbstauskunft' THEN 'Selbstauskunft & Unterlagen'
    WHEN 'objektauswahl' THEN 'Objektpräsentation / Closing'
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

-- ── 3. Kennzahlen ───────────────────────────────────────────────────────────
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
    WHEN 'finanzierung'          THEN 0.70
    WHEN 'bankgutachter'         THEN 0.75
    WHEN 'besichtigung'          THEN 0.80
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
    WHEN 'finanzierung'          THEN 20
    WHEN 'bankgutachter'         THEN 14
    WHEN 'besichtigung'          THEN 20
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
    WHEN 'finanzierung'          THEN 30
    WHEN 'bankgutachter'         THEN 21
    WHEN 'besichtigung'          THEN 30
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

-- ── 4. Kaufphase und Finanzierung intern frei (nur neue Reihenfolge) ────────
-- src/lib/provisionssatzAbReservierungMigration.test.ts prueft die Liste.
CREATE OR REPLACE FUNCTION public.pipelinestufe_ist_kaufphase(_stufe text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT coalesce(_stufe, '') IN (
    'reservierung', 'bonitaetsunterlagen', 'finanzierung', 'bankgutachter', 'besichtigung', 'notar',
    'faelligkeit', 'abrechnung', 'abgeschlossen'
  );
$$;

COMMENT ON FUNCTION public.pipelinestufe_ist_kaufphase(text) IS
  'true ab Reservierung bis Abgeschlossen. Abbild von PIPELINE_STUFEN in '
  'src/lib/pipelineStufen.ts; ab hier wird der Provisionssatz festgeschrieben.';

-- Gegenstueck zu FREIGESCHALTET_AB_RESERVIERUNG in src/lib/investmentFreischaltung.ts.
CREATE OR REPLACE FUNCTION public.finanzierung_intern_frei_meta(_meta jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT COALESCE(_meta ->> 'rvSigned', 'false') = 'true'
     AND COALESCE(_meta ->> 'pipelineStufe', '') IN (
           'reservierung', 'bonitaetsunterlagen', 'finanzierung', 'bankgutachter', 'besichtigung', 'notar',
           'faelligkeit', 'abrechnung', 'abgeschlossen'
         )
$$;

COMMENT ON FUNCTION public.finanzierung_intern_frei_meta(jsonb) IS
  'Ist die Finanzierung nach diesem investments.meta intern offen? '
  'Reservierung unterschrieben und Stufe ab Reservierung. Gegenstueck zu '
  'finanzierungIntern im Frontend, ohne die Objektpruefung.';
