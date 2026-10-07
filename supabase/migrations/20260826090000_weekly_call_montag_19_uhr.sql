-- Weekly Sales Call wandert von Dienstag 12:30 auf Montag 19:00 Uhr.
--
-- Geaendert wird nur der Stichtag. Die Dauer bleibt eine Stunde, der Schnitt
-- liegt also jetzt bei 20:00 statt bei 13:30 deutscher Ortszeit.
--
-- Gerechnet wird ausdruecklich in deutscher Ortszeit. Der Server laeuft in UTC,
-- und ohne diese Umrechnung faellt der Schnitt im Sommer eine Stunde falsch.
--
-- Dieselbe Regel steht im Frontend in src/lib/weeklyCallZeit.ts. Wer den Call
-- erneut verlegt, muss beide Stellen aendern.
--
-- Bereits eingetragene Punkte behalten ihren alten call_termin. Sie sind Teil
-- der Rueckschau und werden bewusst nicht umgeschrieben. Nur neue Punkte
-- fallen auf die Montagstermine.
--
-- pg_cron ist hier nicht betroffen: Zum Weekly Sales Call gibt es keinen
-- Zeitplan. Die alten teamcall-Jobs wurden bereits in
-- 20260622151218_e0bf3b8b-e8f7-4f5b-b24c-fbf64af635ca.sql abgeschaltet.

CREATE OR REPLACE FUNCTION public.weekly_call_woche(_zeitpunkt timestamptz DEFAULT now())
RETURNS date
LANGUAGE sql
STABLE
SET search_path = 'public'
AS $$
  SELECT CASE
    WHEN extract(isodow FROM lokal) = 1 AND lokal::time < time '20:00' THEN lokal::date
    WHEN extract(isodow FROM lokal) = 1 THEN lokal::date + 7
    ELSE lokal::date + ((1 - extract(isodow FROM lokal)::int + 7) % 7)
  END
  FROM (SELECT (_zeitpunkt AT TIME ZONE 'Europe/Berlin') AS lokal) AS t;
$$;

COMMENT ON FUNCTION public.weekly_call_woche(timestamptz) IS
  'Termin des Weekly Sales Call, zu dem ein Zeitpunkt gehoert. Montag, '
  'Schnitt um 20:00 deutscher Ortszeit. Einzige Stelle, an der der Stichtag steht.';
