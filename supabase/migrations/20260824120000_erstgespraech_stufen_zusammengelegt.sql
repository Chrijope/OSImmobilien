/*
 * Erstgespraech: aus zwei Stufen wird eine.
 *
 * Bisher gab es "Erstgespraech geplant" und "Erstgespraech gefuehrt". Die
 * Trennung hat nie funktioniert, weil keine Stelle im System nach dem Gespraech
 * von der einen auf die andere geschaltet hat. "gefuehrt" wurde beim Anlegen
 * eines Kontakts gesetzt und vom Setter-Skript beim BUCHEN eines Termins.
 * Damit trennten die beiden Stufen nicht geplant von gefuehrt, sondern nur, auf
 * welchem Weg der Kontakt entstanden ist, und der Forecast rechnete denselben
 * Sachverhalt einmal mit 15 und einmal mit 20 Prozent.
 *
 * Beim Beratungsgespraech gab es diese Trennung nie, dort ist es seit jeher
 * eine Stufe. Genau so ist es jetzt auch beim Erstgespraech.
 *
 * Bleibender Schluessel ist "erstgespraech_geplant", weil der Buchungs-Trigger
 * ihn schreibt. Angezeigt wird er als "Erstgespraech".
 */

-- ── 1. Rangfunktion neu, ohne die entfallene Stufe ───────────────────────────
--
-- "erstgespraech" bekommt denselben Rang wie "erstgespraech_geplant". So ist
-- die Reihenfolge auch dann stimmig, wenn ein Altdatensatz die alte
-- Schreibweise noch traegt. Muss mit PIPELINE_STUFEN in
-- src/lib/pipelineStufen.ts uebereinstimmen, das prueft
-- buchungPipelineRang.test.ts.
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
    WHEN 'bonitaetsunterlagen'   THEN 12
    WHEN 'finanzierung'          THEN 13
    WHEN 'notar'                 THEN 14
    WHEN 'faelligkeit'           THEN 15
    WHEN 'abrechnung'            THEN 16
    WHEN 'abgeschlossen'         THEN 17
    WHEN 'bestandsimport'        THEN 18
    WHEN 'archiviert'            THEN 19
    WHEN 'verloren'              THEN 20
    -- Legacy-Aliase auf ihre heutige Entsprechung.
    WHEN 'zugewiesen'            THEN 0
    WHEN 'kontaktversuche'       THEN 2
    WHEN 'vermoegensaufbau'      THEN 3
    ELSE -1
  END;
$$;

COMMENT ON FUNCTION public.buchung_pipeline_rang(text) IS
  'Rang einer Pipelinestufe. Muss mit PIPELINE_STUFEN in src/lib/pipelineStufen.ts '
  'uebereinstimmen, das prueft buchungPipelineRang.test.ts. Die Stufe '
  'follow_up_objekt wird ausschliesslich manuell gesetzt. "erstgespraech" ist '
  'seit dem 24.08.2026 ein Altdaten-Alias auf "erstgespraech_geplant".';

-- ── 2. Bestehende Kontakte umziehen ──────────────────────────────────────────
UPDATE public.kontakte
   SET meta = jsonb_set(COALESCE(meta, '{}'::jsonb),
                        '{pipelineStufe}',
                        '"erstgespraech_geplant"'::jsonb,
                        true)
 WHERE meta ->> 'pipelineStufe' = 'erstgespraech';

-- ── 3. Bestehende Investments umziehen ───────────────────────────────────────
UPDATE public.investments
   SET meta = jsonb_set(COALESCE(meta, '{}'::jsonb),
                        '{pipelineStufe}',
                        '"erstgespraech_geplant"'::jsonb,
                        true)
 WHERE meta ->> 'pipelineStufe' = 'erstgespraech';
