-- Anlage-V-Felder fuer eigene Investments (Kundenportal, Stufe 2)
--
-- Das Steuer-Cockpit der eigenen Investments rechnet seit Stufe 1 ohne stille
-- Schaetzwerte: Fehlt eine Angabe, bleibt der jeweilige Posten auf "Angabe
-- fehlt". Diese Spalten liefern die bisher fehlenden Angaben fuer die
-- Anlage V. Alle Spalten sind NULL-faehig, NULL heisst "Angabe fehlt" und
-- bewusst NICHT 0. Der Miteigentumsanteil bekommt absichtlich KEINEN
-- Default von 100, der Standard wird nur in der Oberflaeche angezeigt.
--
-- Der Code funktioniert auch ohne diese Migration: Beim Speichern landen die
-- Werte zusaetzlich in meta.anlageV (gleiche Schluessel), gelesen wird
-- bevorzugt die Spalte, sonst meta. Schlaegt das Schreiben der Spalten fehl,
-- wiederholt der Client den Vorgang ohne die neuen Spalten.

ALTER TABLE public.externe_investments
  ADD COLUMN IF NOT EXISTS gebaeude_anteil_prozent numeric,
  ADD COLUMN IF NOT EXISTS afa_satz_prozent numeric,
  ADD COLUMN IF NOT EXISTS grundsteuer_jahr numeric,
  ADD COLUMN IF NOT EXISTS versicherung_jahr numeric,
  ADD COLUMN IF NOT EXISTS verwaltungskosten_jahr numeric,
  ADD COLUMN IF NOT EXISTS hausgeld_nicht_umlage_monat numeric,
  ADD COLUMN IF NOT EXISTS umlagen_monat numeric,
  ADD COLUMN IF NOT EXISTS miteigentumsanteil_prozent numeric;

COMMENT ON COLUMN public.externe_investments.gebaeude_anteil_prozent IS
  'Anteil des Gebaeudes an den Anschaffungskosten in Prozent (Kaufpreisaufteilung, z. B. BMF-Arbeitshilfe). NULL = Angabe fehlt.';
COMMENT ON COLUMN public.externe_investments.afa_satz_prozent IS
  'AfA-Satz in Prozent. NULL = Angabe fehlt, dann wird er nach Baujahr (§ 7 Abs. 4 EStG) bestimmt oder gar nicht.';
COMMENT ON COLUMN public.externe_investments.grundsteuer_jahr IS
  'Grundsteuer in Euro pro Jahr. NULL = Angabe fehlt.';
COMMENT ON COLUMN public.externe_investments.versicherung_jahr IS
  'Gebaeude- und Haftpflichtversicherung in Euro pro Jahr. NULL = Angabe fehlt.';
COMMENT ON COLUMN public.externe_investments.verwaltungskosten_jahr IS
  'Verwaltungskosten (Verwaltervergütung, Kontofuehrung usw.) in Euro pro Jahr. NULL = Angabe fehlt.';
COMMENT ON COLUMN public.externe_investments.hausgeld_nicht_umlage_monat IS
  'Nicht umlagefaehiger Hausgeld-Anteil in Euro pro Monat, ohne Ruecklagenzufuehrung. NULL = Angabe fehlt.';
COMMENT ON COLUMN public.externe_investments.umlagen_monat IS
  'Vereinnahmte Nebenkosten-Vorauszahlungen des Mieters in Euro pro Monat. NULL = Angabe fehlt.';
COMMENT ON COLUMN public.externe_investments.miteigentumsanteil_prozent IS
  'Miteigentumsanteil in Prozent. NULL = Angabe fehlt, angezeigt und gerechnet wird dann mit 100.';

-- Plausibilitaetsgrenzen. NULL bleibt ueberall erlaubt (Angabe fehlt).
ALTER TABLE public.externe_investments
  DROP CONSTRAINT IF EXISTS externe_investments_anlage_v_prozente,
  DROP CONSTRAINT IF EXISTS externe_investments_anlage_v_betraege;

ALTER TABLE public.externe_investments
  ADD CONSTRAINT externe_investments_anlage_v_prozente CHECK (
    (gebaeude_anteil_prozent IS NULL
      OR (gebaeude_anteil_prozent >= 0 AND gebaeude_anteil_prozent <= 100))
    AND (afa_satz_prozent IS NULL
      OR (afa_satz_prozent >= 0 AND afa_satz_prozent <= 100))
    AND (miteigentumsanteil_prozent IS NULL
      OR (miteigentumsanteil_prozent >= 0 AND miteigentumsanteil_prozent <= 100))
  ),
  ADD CONSTRAINT externe_investments_anlage_v_betraege CHECK (
    (grundsteuer_jahr IS NULL OR grundsteuer_jahr >= 0)
    AND (versicherung_jahr IS NULL OR versicherung_jahr >= 0)
    AND (verwaltungskosten_jahr IS NULL OR verwaltungskosten_jahr >= 0)
    AND (hausgeld_nicht_umlage_monat IS NULL OR hausgeld_nicht_umlage_monat >= 0)
    AND (umlagen_monat IS NULL OR umlagen_monat >= 0)
  );
