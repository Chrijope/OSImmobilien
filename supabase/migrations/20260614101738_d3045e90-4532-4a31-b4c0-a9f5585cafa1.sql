
-- 1) Du-Form für die Standard-Beschreibung des Weekly Sales Calls
UPDATE public.team_call_settings
SET beschreibung = '60-minütiger Sales Call: Wochenplanung, offene Fragen aus dem Team, Trainings- und Schulungseinheiten. Bitte trag deine Themen für den Call rechtzeitig ein.'
WHERE beschreibung IS NULL
   OR beschreibung ILIKE '%Bitte tragen Sie%';

-- 2) Punkte: alle authentifizierten Nutzer dürfen lesen
DROP POLICY IF EXISTS "team_call_punkte select own or leitung" ON public.team_call_punkte;

CREATE POLICY "team_call_punkte select all auth"
ON public.team_call_punkte FOR SELECT
TO authenticated
USING (true);

-- 3) Cron-Jobs für Weekly Sales Call Reminder & Zusammenfassung
--    pg_cron arbeitet in UTC.
--    Lokale Zielzeiten (Europe/Berlin, CEST = UTC+2):
--      Do 09:00 Berlin = Do 07:00 UTC
--      So 19:00 Berlin = So 17:00 UTC
--      Mo 18:00 Berlin = Mo 16:00 UTC
--    (Toleriert; Sommerzeit reicht für unsere Anforderungen.)

SELECT cron.unschedule('teamcall-thursday-reminder')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'teamcall-thursday-reminder');
SELECT cron.unschedule('teamcall-sunday-summary')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'teamcall-sunday-summary');
SELECT cron.unschedule('teamcall-monday-reminder')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'teamcall-monday-reminder');

SELECT cron.schedule(
  'teamcall-thursday-reminder',
  '0 7 * * 4',
  $$
  SELECT net.http_post(
    url := 'https://irwdgutegmivbtgmftyc.supabase.co/functions/v1/send-teamcall-emails',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{"mode":"thursday-reminder"}'::jsonb
  );
  $$
);

SELECT cron.schedule(
  'teamcall-sunday-summary',
  '0 17 * * 0',
  $$
  SELECT net.http_post(
    url := 'https://irwdgutegmivbtgmftyc.supabase.co/functions/v1/send-teamcall-emails',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{"mode":"sunday-summary"}'::jsonb
  );
  $$
);

SELECT cron.schedule(
  'teamcall-monday-reminder',
  '0 16 * * 1',
  $$
  SELECT net.http_post(
    url := 'https://irwdgutegmivbtgmftyc.supabase.co/functions/v1/send-teamcall-emails',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{"mode":"monday-reminder"}'::jsonb
  );
  $$
);
