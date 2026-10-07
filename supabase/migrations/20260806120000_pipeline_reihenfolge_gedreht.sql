-- ===========================================================================
-- Pipeline: Objektauswahl und Reservierung vor die Bonitätsunterlagen
-- ===========================================================================
--
-- Bisher lag die Bonitätsprüfung vor der Objektauswahl: erst wissen, was der
-- Kunde tragen kann, dann Objekte zeigen. Das bremste genau in dem Moment, in
-- dem der Kunde nach dem Beratungsgespräch am heißesten ist. Wer zuerst nach
-- Gehaltsnachweisen fragt, verliert Schwung.
--
-- Neue Reihenfolge:
--
--   Beratungsgespräch → Selbstauskunft → Objektauswahl → Reservierung
--   → Bonitätsunterlagen → Finanzierung
--
-- Ein konkretes Objekt motiviert deutlich mehr zur Abgabe der Unterlagen als
-- eine abstrakte Anforderung. Der Preis: Eine Einheit ist reserviert, bevor
-- die Finanzierbarkeit feststeht. Dagegen meldet der Nachtwächter
-- Reservierungen, die länger als vierzehn Tage ohne freigegebene Bonität
-- stehen, siehe unten.
--
-- Diese Funktion verhindert, dass ein Kunde durch eine späte Buchung in der
-- Pipeline zurückfällt. Sie muss dieselbe Reihenfolge kennen wie der Code,
-- sonst rutschen Kunden an Stellen, die niemand erwartet. Genau das prüft
-- `src/lib/buchungPipelineRang.test.ts` bei jedem Testlauf.

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
    WHEN 'erstgespraech'         THEN 5
    WHEN 'eg_noshow'             THEN 6
    WHEN 'beratungsgespraech'    THEN 7
    WHEN 'bg_noshow'             THEN 8
    WHEN 'selbstauskunft'        THEN 9
    -- Ab hier gedreht: vorher Bonität 10, Objektauswahl 11, Reservierung 12.
    WHEN 'objektauswahl'         THEN 10
    WHEN 'reservierung'          THEN 11
    WHEN 'bonitaetsunterlagen'   THEN 12
    WHEN 'finanzierung'          THEN 13
    WHEN 'notar'                 THEN 14
    WHEN 'faelligkeit'           THEN 15
    WHEN 'abrechnung'            THEN 16
    WHEN 'abgeschlossen'         THEN 17
    WHEN 'bestandsimport'        THEN 18
    WHEN 'archiviert'            THEN 19
    WHEN 'verloren'              THEN 20
    -- Legacy-Aliase auf ihre heutige Entsprechung, unveraendert aus der
    -- Vorgaengerfassung uebernommen. Sie werden vom Test gegen die Zuordnung
    -- in buchungPipelineRang.test.ts geprueft.
    WHEN 'zugewiesen'            THEN 0
    WHEN 'kontaktversuche'       THEN 2
    WHEN 'vermoegensaufbau'      THEN 3
    ELSE -1
  END;
$$;

COMMENT ON FUNCTION public.buchung_pipeline_rang(text) IS
  'Rang einer Pipelinestufe. Muss mit PIPELINE_STUFEN in src/lib/pipelineStufen.ts '
  'uebereinstimmen, das prueft buchungPipelineRang.test.ts.';

-- ===========================================================================
-- Bestandskunden neu einsortieren
-- ===========================================================================
--
-- Die meisten Kunden ordnen sich von selbst neu ein, weil die Stufe aus den
-- Daten abgeleitet wird: unterschriebene Selbstauskunft, offene
-- Reservierungsvereinbarung, freigegebene Bonität. Wer aber eine von Hand
-- gesetzte Stufe trägt, bleibt darauf stehen.
--
-- Ein Fall braucht Aufmerksamkeit: Kunden, die heute in
-- "bonitaetsunterlagen" stehen. Diese Stufe liegt jetzt HINTER der
-- Reservierung. Ohne Korrektur stünden sie plötzlich weiter, als sie sind,
-- und die Phasenkacheln für Objektauswahl und Reservierung wären als
-- "erledigt" markiert, obwohl nie etwas reserviert wurde.
--
-- Sie werden deshalb auf "objektauswahl" zurückgesetzt, sofern keine
-- Reservierungsvereinbarung an ihnen hängt. Das ist die Stufe, die ihrem
-- tatsächlichen Stand entspricht: Selbstauskunft da, Objekt noch offen.

DO $$
DECLARE
  v_betroffen integer;
BEGIN
  WITH ohne_rv AS (
    SELECT i.id
      FROM public.investments i
     WHERE i.meta->>'pipelineStufe' = 'bonitaetsunterlagen'
       -- Keine unterschriebene und keine offene Reservierungsvereinbarung.
       AND coalesce((i.meta->>'rvSigned')::boolean, false) = false
       AND NOT EXISTS (
         SELECT 1 FROM public.signature_requests s
          WHERE s.investment_id::text = i.id::text
            AND s.person_type LIKE 'rv_%'
       )
  )
  UPDATE public.investments i
     SET meta = jsonb_set(
           coalesce(i.meta, '{}'::jsonb),
           '{pipelineStufe}',
           '"objektauswahl"'::jsonb
         ) || jsonb_build_object(
           'stufeKorrigiertAm', to_jsonb(now()),
           'stufeKorrigiertGrund', to_jsonb('Pipeline-Reihenfolge gedreht am 06.08.2026'::text)
         )
    FROM ohne_rv
   WHERE i.id = ohne_rv.id;

  GET DIAGNOSTICS v_betroffen = ROW_COUNT;
  RAISE NOTICE 'Pipeline-Umstellung: % Investment(s) von bonitaetsunterlagen auf objektauswahl gesetzt', v_betroffen;
END $$;
