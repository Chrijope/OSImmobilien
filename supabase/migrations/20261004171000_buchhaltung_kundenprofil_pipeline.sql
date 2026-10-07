-- ===========================================================================
-- Buchhaltung: Kundenprofil und Pipeline freigeben
-- ===========================================================================
--
-- WARUM
--
--   Backoffice und Buchhaltung setzen die Stufen „Abrechnung“ und
--   „Abgeschlossen“ (Datenbank seit 20261001120000,
--   `pipeline_abschluss_schuetzen`). Die Buchhaltung kam aber weder ins
--   Kundenprofil noch in die Pipeline: In `role_permissions` fehlen
--   /kunden und /pipeline (live gesehen am 04.10.2026). Lesen darf sie die
--   Kontakte schon (`darf_alle_kunden_sehen`).
--
-- WAS DIESE MIGRATION TUT
--
--   Zwei Zeilen in `role_permissions`. Aendert keine anderen Daten, keine
--   Function auszurollen, Reihenfolge egal, wiederholbar.
--
-- OHNE SIE
--
--   Die Oberflaeche hat dieselben Eintraege als Rueckfall, massgeblich ist
--   aber die Tabelle: Die Buchhaltung sieht die beiden Punkte weiter nicht.
-- ===========================================================================

INSERT INTO public.role_permissions (role, url) VALUES
  ('buchhaltung', '/kunden'),
  ('buchhaltung', '/pipeline')
ON CONFLICT DO NOTHING;
