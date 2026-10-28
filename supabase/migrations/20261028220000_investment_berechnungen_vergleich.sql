-- ===========================================================================
-- Persönlicher Objektvergleich speichern (Christian, 28.10.2026)
-- ===========================================================================
--
-- Der Investmentrechner bekommt den „Persönlichen Objektvergleich“ (zwei
-- Wohnungen, Aufbau wie der Vergleich vom 28.10.2026). Christian: Vergleich
-- „speichern und später wieder öffnen“.
--
-- Gespeichert wird in investment_berechnungen, damit dieselben Rechte gelten
-- wie für jede Berechnung (darf_investment_berechnung, Buchhaltung nur lesend,
-- Zusammenführen von Kontakten). Eine Zeile mit `vergleich` ist ein
-- Vergleich; `eingabe` bleibt dort leer. Die Liste der Berechnungen im
-- Kundenprofil blendet diese Zeilen aus (investmentBerechnungenStore.ts).
--
-- Nur hinzufügend, ändert keine Daten, wiederholbar.

ALTER TABLE public.investment_berechnungen ADD COLUMN IF NOT EXISTS vergleich jsonb;

COMMENT ON COLUMN public.investment_berechnungen.vergleich IS
  'Persönlicher Objektvergleich (KundenObjektvergleich, Version 1); NULL bei einer normalen Berechnung.';
