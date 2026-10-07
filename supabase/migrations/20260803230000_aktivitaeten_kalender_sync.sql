-- Termine aus dem CRM im eigenen Kalender des Mitarbeiters.
--
-- Bisher lasen Google und iCloud nur in eine Richtung: Der CRM-Kalender zeigte
-- fremde Termine an, aber ein im CRM angelegter Termin blieb im CRM. Damit ein
-- Termin spaeter auch geaendert oder geloescht werden kann, muss die Aktivitaet
-- sich merken, welcher Eintrag im fremden Kalender zu ihr gehoert.
--
-- `kalender_typ`      'google' oder 'apple'
-- `kalender_event_id` die Kennung dort. Bei Google die Event-ID, bei iCloud die
--                     UID, die zugleich der Dateiname der .ics-Datei ist.
-- `kalender_url`      nur bei iCloud: in welchem Kalender die Datei liegt.

ALTER TABLE public.aktivitaeten
  ADD COLUMN IF NOT EXISTS kalender_typ text,
  ADD COLUMN IF NOT EXISTS kalender_event_id text,
  ADD COLUMN IF NOT EXISTS kalender_url text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'aktivitaeten_kalender_typ_chk'
  ) THEN
    ALTER TABLE public.aktivitaeten
      ADD CONSTRAINT aktivitaeten_kalender_typ_chk
      CHECK (kalender_typ IS NULL OR kalender_typ IN ('google', 'apple'));
  END IF;
END $$;

-- Fuer das Aufraeumen: welche Termine haengen ueberhaupt an einem Kalender?
CREATE INDEX IF NOT EXISTS aktivitaeten_kalender_idx
  ON public.aktivitaeten (kalender_typ, kalender_event_id)
  WHERE kalender_event_id IS NOT NULL;
