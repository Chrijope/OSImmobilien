-- Charlottes Tagesbriefing: Zeitplan auf 08:03 Uhr verschieben, Wartezeit 60 Sekunden
--
-- Am 15.09.2026 kam das erste Briefing nicht an. Der Zeitplan hatte um
-- 06:00:00 UTC gefeuert, aber der Aufruf scheiterte mit
-- "Timeout of 5000 ms reached, DNS time 5001 ms": Zur vollen Stunde starten
-- bei uns mindestens acht Zeitplaene gleichzeitig, und drei davon bekamen in
-- diesem Gedraenge nicht einmal die Adresse aufgeloest. Die Function selbst
-- wurde nie erreicht.
--
-- Zwei Aenderungen:
--   1. 08:03 Uhr statt 08:00 Uhr. In den Minuten nach der vollen Stunde laeuft
--      nur noch der Minutentakt, das Gedraenge ist vorbei. Die Stundenpruefung
--      in der Function (8 Uhr deutscher Zeit) bleibt erfuellt.
--   2. 60 Sekunden Wartezeit statt der 5 Sekunden Vorgabe von pg_net. Charlotte
--      fragt fuer ihren Text das Modell, das dauert laenger als fuenf Sekunden.
--      Mit der kurzen Frist haette pg_net jeden Lauf als Fehlschlag verbucht,
--      selbst wenn die Mail hinausging.
--
-- Der Rest (Empfaengerliste, Function, Vorlage) bleibt unveraendert.

DO $$
DECLARE
  _eintrag RECORD;
  _alt RECORD;
  _url text := 'https://irwdgutegmivbtgmftyc.supabase.co/functions/v1/tagesbriefing';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron ist nicht installiert, der Zeitplan wurde nicht gesetzt.';
    RETURN;
  END IF;

  -- Erst alles entfernen, was auf diese Function zeigt.
  FOR _alt IN
    SELECT jobname FROM cron.job
     WHERE jobname IN ('tagesbriefing-sommer', 'tagesbriefing-winter')
        OR command LIKE '%/functions/v1/tagesbriefing%'
  LOOP
    BEGIN
      PERFORM cron.unschedule(_alt.jobname);
      RAISE NOTICE 'Alter Zeitplan "%" entfernt.', _alt.jobname;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Zeitplan "%" konnte nicht entfernt werden: %. Bitte von Hand loeschen, sonst laeuft das Briefing doppelt.',
        _alt.jobname, SQLERRM;
    END;
  END LOOP;

  FOR _eintrag IN
    SELECT * FROM (VALUES
      ('tagesbriefing-sommer', '3 6 * * 1-5'),   -- 08:03 deutscher Sommerzeit
      ('tagesbriefing-winter', '3 7 * * 1-5')    -- 08:03 deutscher Winterzeit
    ) AS t(jobname, plan)
  LOOP
    PERFORM cron.schedule(
      _eintrag.jobname,
      _eintrag.plan,
      format(
        $cron$SELECT net.http_post(url := %L, headers := '{"Content-Type": "application/json"}'::jsonb, body := '{}'::jsonb, timeout_milliseconds := 60000);$cron$,
        _url
      )
    );
    RAISE NOTICE 'Zeitplan "%" gesetzt: % ruft %.', _eintrag.jobname, _eintrag.plan, _url;
  END LOOP;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Zeitplan fuer das Tagesbriefing nicht gesetzt: %. Bitte von Hand anlegen.', SQLERRM;
END $$;

-- Nachsehen. Erwartet: zwei Zeilen, Zeitplan "3 6 * * 1-5" und "3 7 * * 1-5",
-- und im Befehl "timeout_milliseconds := 60000".

SELECT jobname, schedule, active, command
  FROM cron.job
 WHERE jobname LIKE 'tagesbriefing-%'
 ORDER BY jobname;
