-- Weekly Sales Call: Wochenschnitt von 20:00 auf 20:30 Uhr.
--
-- Seit September 2026 gibt es zwei Runden am selben Montag: Lead-Berater
-- starten 19:00 Uhr, Vertriebspartner 19:30 Uhr, beide dauern eine Stunde.
-- Der Schnitt liegt eine Calldauer nach dem SPAETEREN Start, also 20:30.
-- Sonst fiele das Ende des 19:30-Calls schon in die naechste Woche und
-- Punkte, die waehrend des Calls eingetragen werden, landeten am falschen
-- Termin.
--
-- Gerechnet wird weiterhin in deutscher Ortszeit; der Server laeuft in UTC.
--
-- Dieselbe Regel steht im Frontend in src/lib/weeklyCallZeit.ts
-- (CALL_SCHNITT_STUNDE/CALL_SCHNITT_MINUTE). Wer den Call erneut verlegt,
-- muss beide Stellen aendern.
--
-- Bereits eingetragene Punkte behalten ihren call_termin, es aendert sich
-- nur die Zuordnung kuenftiger Zeitpunkte zwischen 20:00 und 20:30.

CREATE OR REPLACE FUNCTION public.weekly_call_woche(_zeitpunkt timestamptz DEFAULT now())
RETURNS date
LANGUAGE sql
STABLE
SET search_path = 'public'
AS $$
  SELECT CASE
    WHEN extract(isodow FROM lokal) = 1 AND lokal::time < time '20:30' THEN lokal::date
    WHEN extract(isodow FROM lokal) = 1 THEN lokal::date + 7
    ELSE lokal::date + ((1 - extract(isodow FROM lokal)::int + 7) % 7)
  END
  FROM (SELECT (_zeitpunkt AT TIME ZONE 'Europe/Berlin') AS lokal) AS t;
$$;

COMMENT ON FUNCTION public.weekly_call_woche(timestamptz) IS
  'Termin des Weekly Sales Call, zu dem ein Zeitpunkt gehoert. Montag, '
  'Schnitt um 20:30 deutscher Ortszeit (Lead-Berater 19:00, '
  'Vertriebspartner 19:30, plus eine Stunde Calldauer). Einzige Stelle, '
  'an der der Stichtag steht.';
