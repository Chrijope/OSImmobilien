-- ===========================================================================
-- Zeitpläne für die beiden Bewerber-Terminerinnerungen
-- ===========================================================================
--
-- Zwei fertig gebaute Edge Functions hatten in keiner einzigen Migration einen
-- Zeitplan und wurden deshalb vermutlich noch nie ausgeführt:
--
--   send-bewerber-erstgespraech-reminders   48h/6h/1h vor dem Erstgespräch
--   send-bewerber-closing-reminders         48h/6h/1h vor dem Closing
--
-- Beide sind in `config.toml` bereits auf `verify_jwt = false` gestellt, sind
-- über den Zeitplan also ohne Token erreichbar. Sie führen selbst Buch darüber,
-- was schon versandt wurde (`meta.erstgespraechRemindersSent` beziehungsweise
-- `meta.closingRemindersSent`) und übergeben zusätzlich einen Idempotenzschlüssel
-- an `send-transactional-email`. Ein doppelter Lauf verschickt also nichts doppelt.
--
-- Takt: alle zehn Minuten. Die Functions treffen eine Erinnerung nur, wenn der
-- Termin in einem Fenster von einer Stunde um die jeweilige Schwelle liegt
-- (47,5 bis 48,5 Stunden, 5,5 bis 6,5 Stunden, 0,5 bis 1,5 Stunden). Bei zehn
-- Minuten Takt fällt in jedes dieser Fenster ein halbes Dutzend Läufe, ein
-- einzelner Ausfall bleibt damit folgenlos. Ein gröberer Takt von etwa einer
-- Stunde träfe die Fenster zwar rechnerisch auch, aber ohne jede Reserve.
--
-- Anders als die Eskalationsdienste laufen diese beiden rund um die Uhr, denn
-- die Ein-Stunden-Erinnerung muss auch für einen Termin um 18 Uhr greifen. Der
-- Aufwand je Lauf ist gering, gelesen werden nur Bewerbungen mit E-Mail-Adresse.
--
-- Wie bei den Eskalationsdiensten wird vorher jeder Job entfernt, dessen Befehl
-- auf dieselbe Function zeigt, auch wenn er anders heißt. Ein von Hand im
-- Supabase-Editor angelegter Job liefe sonst neben dem neuen weiter.

DO $$
DECLARE
  _dienst RECORD;
  _alt RECORD;
  _url text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron ist nicht installiert, die Zeitplaene wurden nicht gesetzt.';
    RETURN;
  END IF;

  FOR _dienst IN
    SELECT * FROM (VALUES
      ('bewerber-erstgespraech-erinnerungen', 'send-bewerber-erstgespraech-reminders', '*/10 * * * *'),
      ('bewerber-closing-erinnerungen',       'send-bewerber-closing-reminders',       '*/10 * * * *')
    ) AS t(jobname, function_name, plan)
  LOOP
    _url := 'https://DEIN-SUPABASE-PROJEKT.supabase.co/functions/v1/' || _dienst.function_name;

    FOR _alt IN
      SELECT jobname FROM cron.job
       WHERE jobname = _dienst.jobname
          OR command LIKE '%/functions/v1/' || _dienst.function_name || '%'
    LOOP
      BEGIN
        PERFORM cron.unschedule(_alt.jobname);
        RAISE NOTICE 'Alter Zeitplan "%" entfernt.', _alt.jobname;
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Zeitplan "%" konnte nicht entfernt werden: %. Bitte von Hand loeschen, sonst laeuft % doppelt.',
          _alt.jobname, SQLERRM, _dienst.function_name;
      END;
    END LOOP;

    PERFORM cron.schedule(
      _dienst.jobname,
      _dienst.plan,
      format(
        $cron$SELECT net.http_post(url := %L, headers := '{"Content-Type": "application/json"}'::jsonb, body := '{}'::jsonb);$cron$,
        _url
      )
    );
    RAISE NOTICE 'Zeitplan "%" gesetzt: % ruft %.', _dienst.jobname, _dienst.plan, _url;
  END LOOP;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Zeitplaene fuer die Bewerber-Erinnerungen nicht gesetzt: %. Bitte von Hand anlegen.', SQLERRM;
END $$;

-- Kontrolle nach dem Lauf: beide Zeilen müssen erscheinen und `active` sein.
--   SELECT jobname, schedule, active FROM cron.job
--    WHERE jobname IN ('bewerber-erstgespraech-erinnerungen', 'bewerber-closing-erinnerungen');
