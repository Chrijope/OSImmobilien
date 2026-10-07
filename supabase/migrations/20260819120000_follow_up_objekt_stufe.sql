-- ===========================================================================
-- Neue Pipelinestufe "follow_up_objekt" (Anzeigename "Follow-Up")
-- ===========================================================================
--
-- Zwischen "objektauswahl" und "reservierung" gibt es jetzt eine zweite
-- Follow-Up-Stufe: Der Kunde hat Objekte gesehen und ueberlegt noch. Sie
-- traegt denselben Anzeigenamen wie die fruehe Wiedervorlage-Stufe
-- "follow_up" (nach "Erreicht"), aber einen eigenen Schluessel.
--
-- NUR MANUELL: Diese Stufe setzt ausschliesslich ein Partner von Hand.
-- Keine Automatik (weder bulk_recompute_pipeline noch der Buchungs-Trigger
-- noch der Auto-Advance im Client) setzt einen Kontakt jemals auf
-- "follow_up_objekt". Automatiken duerfen einen manuell hierhin gesetzten
-- Kontakt nur nach vorne ueberholen (z. B. auf "reservierung", sobald eine
-- Reservierungsvereinbarung eroeffnet ist), nie zurueckziehen.
--
-- Diese Migration erweitert allein die Rangfunktion buchung_pipeline_rang.
-- Sie muss die neue Stufe kennen, sonst haette ein manuell gesetzter Kontakt
-- den Rang -1 und eine spaete Buchung wuerde ihn faelschlich auf
-- "erstgespraech_geplant" zurueckziehen. Die Reihenfolge muss dieselbe sein
-- wie in src/lib/pipelineStufen.ts, das prueft
-- src/lib/buchungPipelineRang.test.ts bei jedem Testlauf.

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
    WHEN 'objektauswahl'         THEN 10
    -- Neu am 19.08.2026: manuelle Follow-Up-Stufe nach der Objektvorstellung.
    WHEN 'follow_up_objekt'      THEN 11
    WHEN 'reservierung'          THEN 12
    WHEN 'bonitaetsunterlagen'   THEN 13
    WHEN 'finanzierung'          THEN 14
    WHEN 'notar'                 THEN 15
    WHEN 'faelligkeit'           THEN 16
    WHEN 'abrechnung'            THEN 17
    WHEN 'abgeschlossen'         THEN 18
    WHEN 'bestandsimport'        THEN 19
    WHEN 'archiviert'            THEN 20
    WHEN 'verloren'              THEN 21
    -- Legacy-Aliase auf ihre heutige Entsprechung, unveraendert aus der
    -- Vorgaengerfassung uebernommen (20260806120000). Sie werden vom Test
    -- gegen die Zuordnung in buchungPipelineRang.test.ts geprueft.
    WHEN 'zugewiesen'            THEN 0
    WHEN 'kontaktversuche'       THEN 2
    WHEN 'vermoegensaufbau'      THEN 3
    ELSE -1
  END;
$$;

COMMENT ON FUNCTION public.buchung_pipeline_rang(text) IS
  'Rang einer Pipelinestufe. Muss mit PIPELINE_STUFEN in src/lib/pipelineStufen.ts '
  'uebereinstimmen, das prueft buchungPipelineRang.test.ts. Die Stufe '
  'follow_up_objekt wird ausschliesslich manuell gesetzt.';
