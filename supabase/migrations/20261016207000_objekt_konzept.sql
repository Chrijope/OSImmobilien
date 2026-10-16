-- Konzept eines Objekts: wofür es sich vor allem eignet (Christian, 16.10.2026).
--
--   zusatzrente  Vermögensaufbau und Zusatzrente
--   steuer       Steuerersparnis
--   beides       beides
--   NULL         noch nicht gepflegt
--
-- Nur die Spalte, keine Daten. Die vorgesehene Belegung (Barfusstraße 9 =
-- steuer, Hauffstraße 38 = zusatzrente, Zossen = beides) pflegt man im
-- Objekt-Formular. Das CRM läuft auch ohne diese Migration: Es liest die
-- Spalte nur, wenn sie da ist, und schreibt sie getrennt vom übrigen Objekt.
-- Rechte: die vorhandenen Regeln der Tabelle `objekte` gelten unverändert.

ALTER TABLE public.objekte ADD COLUMN IF NOT EXISTS konzept text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'objekte_konzept_check') THEN
    ALTER TABLE public.objekte
      ADD CONSTRAINT objekte_konzept_check
      CHECK (konzept IS NULL OR konzept IN ('zusatzrente', 'steuer', 'beides'));
  END IF;
END $$;

COMMENT ON COLUMN public.objekte.konzept IS 'zusatzrente | steuer | beides, NULL = nicht gepflegt';

NOTIFY pgrst, 'reload schema';
