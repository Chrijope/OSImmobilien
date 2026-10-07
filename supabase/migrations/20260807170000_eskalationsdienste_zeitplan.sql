-- ===========================================================================
-- Zeitpläne für die vier Eskalationsdienste
-- ===========================================================================
--
-- Vier fertig gebaute Edge Functions hatten in keiner einzigen Migration einen
-- Zeitplan:
--
--   lead-eskalation-check          legt Aufgaben für liegengebliebene Leads an
--   send-sla-inactivity-nudges     meldet rote SLA-Verstöße in die Glocke
--   send-followup-overdue-nudges   meldet überfällige Follow-Ups
--   weekly-pipeline-mahnreport     der wöchentliche Pipeline-Bericht
--
-- In allen Migrationen zusammen gab es bis heute genau zwei `cron.schedule`,
-- nämlich `nachtpruefung` und `videoraeume-aufraeumen`. Ob jemand die vier
-- Dienste von Hand im Supabase-Editor eingetragen hat, lässt sich aus dem Repo
-- nicht sehen. Deshalb räumt diese Migration vorher auf, und zwar nicht nur
-- über den Jobnamen: Sie entfernt JEDEN vorhandenen Job, dessen Befehl auf
-- dieselbe Function zeigt, auch wenn er anders heißt. Ein von Hand angelegter
-- Job "mahnreport-montags" würde sonst neben dem neuen weiterlaufen und jeder
-- Vertriebspartner bekäme die Mail zweimal.
--
-- Uhrzeiten, alle in UTC wie sämtliche Zeitpläne dieses Projekts:
--
--   03:00  nachtpruefung                  (bestehend)
--   04:30  nachtpruefung-morgenmail       (bestehend)
--   05:00  lead-eskalation-check          neu
--   05:30  send-sla-inactivity-nudges     neu
--   06:00  send-followup-overdue-nudges   neu
--   06:30  weekly-pipeline-mahnreport     neu, nur montags
--
-- Die Reihenfolge ist kein Zufall. `lead-eskalation-check` schreibt Aufgaben
-- und setzt Marker in `kontakte.meta`; die beiden Nudge-Dienste und der
-- Wochenbericht sollen diesen Stand schon sehen und nicht den von gestern.
-- Der halbe Stundenabstand ist großzügig bemessen: Der schwerste der vier
-- läuft über alle Kontakte und braucht dafür Sekunden, nicht Minuten. Er
-- reicht auch dann noch, wenn der Bestand um ein Vielfaches wächst.
--
-- 05:00 UTC ist 07:00 deutscher Sommerzeit und 06:00 im Winter, also vor
-- Arbeitsbeginn. Die Meldungen liegen da, wenn jemand anfängt, statt ihn
-- mitten am Tag zu unterbrechen. Eine Umschaltung auf Sommerzeit wäre mehr
-- Aufwand als Nutzen, das halten die übrigen Zeitpläne genauso.
--
-- Der Wochenbericht läuft montags. Er blickt zurück auf die vergangene Woche
-- und nach vorn auf die kommende, und genau montags früh ist der eine
-- Zeitpunkt, an dem beides zusammenfällt. Am Freitag verschickt, würde er das
-- Wochenende überdauern und niemanden mehr erreichen.

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
      ('lead-eskalation-taeglich',        'lead-eskalation-check',        '0 5 * * *'),
      ('sla-inaktivitaet-taeglich',       'send-sla-inactivity-nudges',   '30 5 * * *'),
      ('followup-overdue-nudges-daily',   'send-followup-overdue-nudges', '0 6 * * *'),
      ('pipeline-mahnreport-montags',     'weekly-pipeline-mahnreport',   '30 6 * * 1')
    ) AS t(jobname, function_name, plan)
  LOOP
    _url := 'https://irwdgutegmivbtgmftyc.supabase.co/functions/v1/' || _dienst.function_name;

    -- Alles wegräumen, was schon auf diese Function zeigt, egal wie es heißt.
    -- Das deckt sowohl einen früheren Lauf dieser Migration ab als auch einen
    -- von Hand im Supabase-Editor angelegten Job.
    FOR _alt IN
      SELECT jobname FROM cron.job
       WHERE jobname = _dienst.jobname
          OR command LIKE '%/functions/v1/' || _dienst.function_name || '%'
    LOOP
      BEGIN
        PERFORM cron.unschedule(_alt.jobname);
        RAISE NOTICE 'Alter Zeitplan "%" entfernt.', _alt.jobname;
      EXCEPTION WHEN OTHERS THEN
        -- Gehört der Job einer anderen Rolle, kommt man nicht heran. Dann ist
        -- ein lauter Hinweis besser als ein stiller Doppelversand.
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
  RAISE NOTICE 'Zeitplaene fuer die Eskalationsdienste nicht gesetzt: %. Bitte von Hand anlegen.', SQLERRM;
END $$;
