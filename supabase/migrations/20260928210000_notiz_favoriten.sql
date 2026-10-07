-- ===========================================================================
-- Favoriten fuer Notizen im Kundenprofil
-- ===========================================================================
--
-- Auftrag vom 28.09.2026: An jeder Notiz im Verlauf des Kundenprofils steht
-- ein Stern. Angepinnte Notizen stehen oben im Reiter "Notizen". Die
-- Markierung gilt gemeinsam fuer alle, die die Notiz sehen, nicht je Nutzer.
--
-- Zwei Spalten an `aktivitaeten`, dort liegen die Notizen (art = 'notiz'):
--
--   * angepinnt_am   Zeitpunkt; gesetzt heisst angepinnt, leer heisst nicht.
--   * angepinnt_von  Kennung dessen, der angepinnt hat.
--
-- Keine neue Regel. Anpinnen darf, wer die Notiz auch bearbeiten darf, und
-- genau das deckt die bestehende Update-Regel "Interne bearbeiten
-- Aktivitaeten (scoped)" ab: jede interne Rolle an den Kunden, die sie sieht.
--
-- Warum nicht `kontakte.meta`: `merge_kontakt_meta` laesst Rollen ohne Blick
-- auf alle Kunden seit 20260928160000 nur an Kontakten schreiben, die sie
-- betreuen. Notizen bearbeiten duerfen aber alle internen Rollen am
-- sichtbaren Kunden. Stift und Stern haetten sonst verschiedene Regeln.
--
-- Der Ausloeser `meeting_mail_vormerken` reagiert nur auf Termine und bleibt
-- von den neuen Spalten unberuehrt.
--
-- Ohne diese Migration laeuft die Anwendung weiter: Niemand sieht einen
-- Favoriten, und ein Klick auf den Stern meldet, dass Favoriten in der
-- Datenbank noch nicht eingerichtet sind. Neue Notizen speichern normal.
--
-- Mehrfach ausfuehrbar, loescht nichts.
-- ===========================================================================

BEGIN;

ALTER TABLE public.aktivitaeten
  ADD COLUMN IF NOT EXISTS angepinnt_am timestamptz,
  ADD COLUMN IF NOT EXISTS angepinnt_von uuid;

COMMENT ON COLUMN public.aktivitaeten.angepinnt_am IS
  'Notiz als Favorit angepinnt, gemeinsam fuer alle am Kunden. Leer = nicht angepinnt. Migration 20260928210000.';
COMMENT ON COLUMN public.aktivitaeten.angepinnt_von IS
  'Kennung dessen, der die Notiz angepinnt hat. Migration 20260928210000.';

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Nachsehen (aendert nichts): Pruefzeile 36.1 in
-- supabase/migrations-inbox/99_PRUEFUNG.sql.
