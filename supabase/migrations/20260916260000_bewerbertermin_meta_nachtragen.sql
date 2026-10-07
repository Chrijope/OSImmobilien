-- ─────────────────────────────────────────────────────────────────────────────
-- Der gebuchte Bewerbertermin fehlt in der Akte und damit in den Erinnerungen
-- ─────────────────────────────────────────────────────────────────────────────
--
-- WORUM ES GEHT
--
-- Ein Bewerbergespraech steht an zwei Stellen: als Zeile in `buchungen` und
-- als Kopie in `bewerbungen.meta` (erstgespraechDatum, erstgespraechUhrzeit,
-- erstgespraechBerater). Die Oberflaeche liest seit 20260916 die Buchung und
-- kommt deshalb auch ohne die Kopie aus.
--
-- Die Erinnerungsfunktion nicht. `send-bewerber-erstgespraech-reminders` liest
-- allein die Kopie und ueberspringt jeden Bewerber ohne Datum oder Uhrzeit
-- (`if (!datum || !uhrzeit) continue;`). Fehlt die Kopie, faellt die
-- Terminerinnerung still aus. Niemand merkt es, bis der Bewerber nicht
-- erscheint.
--
-- Aufgefallen bei Berat Kllapia: Buchung am 24.09. steht, Kopie leer.
--
-- WAS DIESE MIGRATION TUT
--
-- Sie traegt die Kopie aus der Buchung nach, aber nur dort, wo sie fehlt und
-- wo der Termin noch bevorsteht:
--
--   - nur Buchungen mit dem Anlass 'bewerbergespraech'
--   - nur Status 'offen' und Startzeit in der Zukunft
--   - nur wenn Datum ODER Uhrzeit in der Akte fehlen
--
-- Ein vorhandener, abweichender Eintrag wird NICHT ueberschrieben. Wenn HR den
-- Termin von Hand gepflegt hat, ist das die juengere Aussage, und eine
-- Migration ist nicht der Ort, sie zu verwerfen.
--
-- Ein vergangener Termin wird nicht nachgetragen: Eine Erinnerung waere dafuer
-- ohnehin zu spaet, und die Stufe nachtraeglich zu heben waere eine Behauptung
-- ueber die Vergangenheit. Dieselbe Regel wie in 20260916210000.
--
-- `erstgespraechRemindersSent` wird geloescht. Ohne Datum konnte nie eine
-- Erinnerung rausgehen, der Schluessel ist also entweder gar nicht da oder ein
-- Rest aus einem frueheren Termin. Bliebe er stehen, hielte er die Stufen fuer
-- bereits versendet und der neue Termin bekaeme wieder keine Erinnerung.

DO $$
DECLARE
  _zeile record;
  _nachgetragen integer := 0;
BEGIN
  IF to_regclass('public.buchungen') IS NULL
     OR to_regclass('public.bewerbungen') IS NULL THEN
    RAISE NOTICE 'Uebersprungen: buchungen oder bewerbungen fehlt.';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'buchungen'
      AND column_name = 'bewerbung_id'
  ) THEN
    RAISE NOTICE 'Uebersprungen: die Spalte buchungen.bewerbung_id fehlt.';
    RETURN;
  END IF;

  FOR _zeile IN
    SELECT w.id AS bewerbung_id,
           w.vorname,
           w.nachname,
           b.start_at,
           (SELECT p.name FROM public.profiles p WHERE p.id = b.mitarbeiter_id) AS gastgeber_name
      FROM public.bewerbungen w
      JOIN public.buchungen b ON b.bewerbung_id = w.id
     WHERE COALESCE(b.anlass, '') = 'bewerbergespraech'
       AND COALESCE(b.status, '') = 'offen'
       AND COALESCE(b.start_at >= now(), false)
       -- Fehlt eines der beiden Felder, laeuft die Erinnerung ins Leere.
       -- Deshalb beide pruefen und nicht nur das Datum.
       AND (COALESCE(btrim(w.meta ->> 'erstgespraechDatum'), '') = ''
            OR COALESCE(btrim(w.meta ->> 'erstgespraechUhrzeit'), '') = '')
     ORDER BY b.start_at
  LOOP
    UPDATE public.bewerbungen w
       SET meta = (COALESCE(w.meta, '{}'::jsonb) - 'erstgespraechRemindersSent')
                  || jsonb_build_object(
                       'erstgespraechDatum',
                       to_char(_zeile.start_at AT TIME ZONE 'Europe/Berlin', 'YYYY-MM-DD'),
                       'erstgespraechUhrzeit',
                       to_char(_zeile.start_at AT TIME ZONE 'Europe/Berlin', 'HH24:MI'),
                       'erstgespraechBerater', COALESCE(_zeile.gastgeber_name, ''))
     WHERE w.id = _zeile.bewerbung_id;

    IF to_regprocedure('public.bewerber_stufe_closing(uuid)') IS NOT NULL THEN
      PERFORM public.bewerber_stufe_closing(_zeile.bewerbung_id);
    END IF;

    _nachgetragen := _nachgetragen + 1;

    RAISE NOTICE 'Termin nachgetragen: % % am % Uhr.',
      _zeile.vorname, _zeile.nachname,
      to_char(_zeile.start_at AT TIME ZONE 'Europe/Berlin', 'DD.MM.YYYY HH24:MI');
  END LOOP;

  RAISE NOTICE 'Fertig: % Termin(e) in die Akte nachgetragen.', _nachgetragen;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Zum Nachsehen: steht jetzt ueberall dasselbe?
-- ─────────────────────────────────────────────────────────────────────────────
--
--   select w.vorname, w.nachname, b.status,
--          to_char(b.start_at at time zone 'Europe/Berlin', 'DD.MM.YYYY HH24:MI') as laut_buchung,
--          w.meta ->> 'erstgespraechDatum' as laut_akte_datum,
--          w.meta ->> 'erstgespraechUhrzeit' as laut_akte_uhrzeit
--     from public.bewerbungen w
--     join public.buchungen b on b.bewerbung_id = w.id
--    where coalesce(b.anlass, '') = 'bewerbergespraech'
--    order by b.start_at desc;
