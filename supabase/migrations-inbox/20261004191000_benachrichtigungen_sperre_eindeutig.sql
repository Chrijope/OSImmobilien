-- ===========================================================================
-- Glocken mit Sperrschluessel: je Empfaenger und Schluessel nur eine Zeile
-- ===========================================================================
--
-- WARUM
--
-- eigene-investments-reminders schreibt seit dem 04.10.2026 je Anlass einen
-- Sperrschluessel in benachrichtigungen.meta.sperre und prueft vor dem
-- Einfuegen, ob es ihn schon gibt. Laufen zwei Aufrufe gleichzeitig, sehen
-- beide "noch nicht da" und der Kunde bekommt die Glocke zweimal. Ein
-- eindeutiger Index schliesst das in der Datenbank aus; die Function
-- ueberspringt die Ablehnung (23505) still.
--
-- WAS DIESE MIGRATION TUT
--
-- Legt den Teilindex benachrichtigungen_sperre_eindeutig auf
-- (benutzer_id, meta ->> 'sperre') an, nur fuer Zeilen mit diesem Schluessel.
-- Gibt es schon doppelte Zeilen, wird NICHTS angelegt und nichts geloescht,
-- es kommt nur eine Warnung; Pruefzeile 80.3 zaehlt sie. Aendert keine
-- Daten, wiederholbar.
--
-- REIHENFOLGE
--
-- Steht fuer sich, Reihenfolge egal. Ohne den Index laeuft die Function wie
-- bisher, nur ohne Schutz gegen gleichzeitige Laeufe.
-- ===========================================================================

DO $index$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM public.benachrichtigungen
     WHERE meta ? 'sperre'
     GROUP BY benutzer_id, meta ->> 'sperre'
    HAVING count(*) > 1
  ) THEN
    RAISE WARNING 'Es gibt doppelte Glocken mit demselben Sperrschluessel. Der Index wurde NICHT angelegt, es wurde nichts geloescht. Pruefzeile 80.3 zaehlt sie.';
    RETURN;
  END IF;

  CREATE UNIQUE INDEX IF NOT EXISTS benachrichtigungen_sperre_eindeutig
    ON public.benachrichtigungen (benutzer_id, (meta ->> 'sperre'))
    WHERE meta ? 'sperre';
END
$index$;

-- Nachsehen (aendert nichts): Pruefzeilen 80.2 und 80.3 in
-- supabase/migrations-inbox/99_PRUEFUNG.sql.
