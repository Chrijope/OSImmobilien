-- ===========================================================================
-- Kundenerinnerungen zur Selbstauskunft und Reservierung abschalten
-- ===========================================================================
--
-- Entscheidung GL vom 15.09.2026: Der Kunde bekommt nach der Einladung
-- zur Selbstauskunft, nach dem Unterschriftslink zur Selbstauskunft und nach
-- dem Unterschriftslink zur Reservierungsvereinbarung keine automatische
-- Erinnerung mehr. Die Erstversaende bleiben, die internen Erinnerungen an
-- Partner, HR, Admin und Nachtpruefung bleiben ebenfalls.
--
-- Im Code ist das erledigt (send-sa-invitation plant die Kundenmails nicht
-- mehr, signatur-erinnerung und send-reservierung-eskalation schicken keine
-- Kundenmail mehr). Was bleibt, ist der Bestand in der Warteschlange
-- `scheduled_notifications`: Dort liegen Zeilen der Kategorien sa_reminder_1
-- und sa_reminder_2 (sa_reminder_3 vorsorglich), die vor der Abschaltung
-- geplant wurden und noch auf `pending` stehen. Der Verarbeiter
-- `process-scheduled-notifications` legt sie inzwischen selbst still, sobald
-- sie faellig werden; diese Migration raeumt sie einmalig und sichtbar auf,
-- damit die Kundenkarte nichts mehr als "geplant" zeigt.
--
-- Kein Zeitplan wird entfernt, weil dieselben Zeitplaene die internen
-- Erinnerungen tragen:
--   process-scheduled-notifications-every-minute: traegt die Aufgabe an den
--     Partner an Tag 14 (sa_vp_nudge) und alle uebrigen geplanten Glocken
--     aus bellNotifications.ts.
--   signatur-erinnerung-daily: legt bei abgelaufener Unterschrift die
--     Aufgabe fuer den Berater an.
--   reservierung-eskalation: legt an Tag 14 Aufgabe und Glocke fuer den
--     Berater an.
--
-- Mehrfach ausfuehrbar. Nur Zeilen mit Status `pending` werden angefasst,
-- bereits verschickte oder uebersprungene bleiben als Historie stehen.
-- Spalten laut Migration 20260707093205: status, sent_at, error, category.
-- ===========================================================================

UPDATE public.scheduled_notifications
   SET status  = 'cancelled',
       sent_at = now(),
       error   = 'Kundenerinnerungen seit 15.09.2026 abgeschaltet'
 WHERE status = 'pending'
   AND category IN ('sa_reminder_1', 'sa_reminder_2', 'sa_reminder_3');

-- Kontrolle: Die erste Abfrage muss 0 ergeben, die zweite zeigt, was
-- stillgelegt wurde.
--   SELECT count(*) FROM public.scheduled_notifications
--    WHERE status = 'pending'
--      AND category IN ('sa_reminder_1', 'sa_reminder_2', 'sa_reminder_3');
--   SELECT category, status, count(*)
--     FROM public.scheduled_notifications
--    WHERE category IN ('sa_reminder_1', 'sa_reminder_2', 'sa_reminder_3', 'sa_vp_nudge')
--    GROUP BY 1, 2 ORDER BY 1, 2;
