-- ===========================================================================
-- HR-Eskalation bei nicht unterschriebenen Verträgen
-- ===========================================================================
--
-- Der Vertragsversand war die stillste Stelle im Bewerberprozess. Der
-- Signaturlink ist 30 Tage gültig und lief danach lautlos ab, ohne dass
-- jemand im Haus davon erfuhr. An dieser Stelle sind Werbebudget,
-- Erstgespräch und ein volles Closing bereits investiert, es ist also die
-- teuerste Stelle im ganzen Trichter, um jemanden zu verlieren.
--
-- Der Dienst `send-vertrag-hr-eskalation` meldet HR, Inhabern und Admins in
-- vier Stufen, dass ein Vertrag offen liegt:
--
--   nach  3 Tagen   nur eine Meldung in der Glocke, noch kein Grund zur Sorge
--   nach  7 Tagen   Glocke und Mail, Bitte um einen persönlichen Anruf
--   nach 14 Tagen   Glocke und Mail, deutlicher Hinweis auf eine offene Frage
--   nach 25 Tagen   Glocke und Mail, letzte Gelegenheit vor Ablauf des Links
--
-- Jede Stufe geht genau einmal, der Stand steht in `meta.vertragHrEskalation`.
-- Je Lauf wird höchstens eine Stufe gemeldet, damit niemand drei Mails auf
-- einmal bekommt, wenn ein paar Tage niemand hingeschaut hat.
--
-- Täglich um 07:00 UTC, also vor Arbeitsbeginn: Die Meldung liegt da, wenn
-- jemand anfängt, statt ihn mitten am Tag zu unterbrechen.

DO $$
DECLARE
  _alt RECORD;
  _url text := 'https://DEIN-SUPABASE-PROJEKT.supabase.co/functions/v1/send-vertrag-hr-eskalation';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron ist nicht installiert, der Zeitplan wurde nicht gesetzt.';
    RETURN;
  END IF;

  FOR _alt IN
    SELECT jobname FROM cron.job
     WHERE jobname = 'vertrag-hr-eskalation'
        OR command LIKE '%/functions/v1/send-vertrag-hr-eskalation%'
  LOOP
    BEGIN
      PERFORM cron.unschedule(_alt.jobname);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Zeitplan "%" konnte nicht entfernt werden: %.', _alt.jobname, SQLERRM;
    END;
  END LOOP;

  PERFORM cron.schedule(
    'vertrag-hr-eskalation',
    '0 7 * * *',
    format(
      $cron$SELECT net.http_post(url := %L, headers := '{"Content-Type": "application/json"}'::jsonb, body := '{}'::jsonb);$cron$,
      _url
    )
  );
  RAISE NOTICE 'Zeitplan "vertrag-hr-eskalation" gesetzt.';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Zeitplan nicht gesetzt: %. Bitte von Hand anlegen.', SQLERRM;
END $$;
