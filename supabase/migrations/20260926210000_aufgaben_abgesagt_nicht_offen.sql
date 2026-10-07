-- ===========================================================================
-- Abgesagte Automatikaufgaben sperren keine neue mehr
-- ===========================================================================
--
-- Der eindeutige Index `aufgaben_ausloeser_offen_idx` verhindert zwei offene
-- Automatikaufgaben mit demselben Auslöser beim selben Empfänger. Er zählte
-- bisher alles außer „erledigt“ als offen, also auch „abgesagt“.
--
-- Seit dem 26.09.2026 schließt das CRM die Aufgabe „Objekt-Vorstellungstermin
-- vereinbaren“ als „abgesagt“, wenn ein Handbuch-Lead zurück in den Pool geht
-- (Christian). Bei der nächsten Zuteilung soll sie neu entstehen, auch wenn
-- derselbe Partner den Lead wieder bekommt. Mit dem alten Index scheiterte
-- genau dieser Fall an der Sperre.
--
-- Jetzt gilt im Index dieselbe Regel wie überall im Browser (aufgabenStore):
-- offen ist, was weder erledigt noch abgesagt ist. Der neue Index ist enger
-- als der alte, bestehende Zeilen können ihn also nicht verletzen.
--
-- Ohne diese Migration läuft alles weiter. Nur bekommt ein Partner, der einen
-- zurückgegebenen Handbuch-Lead erneut zugeteilt bekommt, die Aufgabe nicht
-- noch einmal.
--
-- Mehrfach ausführbar.

BEGIN;

DROP INDEX IF EXISTS public.aufgaben_ausloeser_offen_idx;

CREATE UNIQUE INDEX aufgaben_ausloeser_offen_idx
  ON public.aufgaben (zugewiesen_an, ausloeser_schluessel)
  WHERE ausloeser_schluessel IS NOT NULL
    AND status NOT IN ('erledigt', 'abgesagt');

COMMENT ON INDEX public.aufgaben_ausloeser_offen_idx IS
  'Hoechstens eine offene Automatikaufgabe je Empfaenger und Ausloeser. Offen = weder erledigt noch abgesagt (seit 20260926210000).';

COMMIT;

NOTIFY pgrst, 'reload schema';
