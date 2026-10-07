-- Tag 2 – Punkt 8: Notartermin TK als echtes Datum
-- Bisher war notartermin_tk ein text-Feld. Es wird zu einem echten date migriert.
-- Die Tabelle hat aktuell keine Datensätze mit notartermin_tk belegt, daher ist die Migration risikofrei.

ALTER TABLE public.objekt_einreichungen
  ALTER COLUMN notartermin_tk TYPE date
  USING NULLIF(trim(notartermin_tk), '')::date;

-- Kommentar zur Spalte, damit die Absicht dokumentiert ist
COMMENT ON COLUMN public.objekt_einreichungen.notartermin_tk IS 'Notartermin TK als echtes Datum (ISO: YYYY-MM-DD). Vorher text, migriert am 2026-06-11.';