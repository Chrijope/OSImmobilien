-- Die Spalte `objekte.highlights` entfällt (Inhaber, 18.10.2026).
--
-- An ihre Stelle treten die Standortargumente in `meta.standortargumente`,
-- im Wizard „Neues Objekt“ per KI erstellt. Es gibt keine alten Objekte,
-- deren Highlights erhalten bleiben müssten. Oberfläche und Functions lesen
-- und schreiben die Spalte seit dem vorigen Push nicht mehr; erst danach
-- wird sie gelöscht, damit die alte Oberfläche während der Veröffentlichung
-- nicht auf eine fehlende Spalte trifft.
--
-- Die Sicherungstabelle `objekte_sicherung_20260922` bleibt unverändert.

ALTER TABLE public.objekte DROP COLUMN IF EXISTS highlights;
