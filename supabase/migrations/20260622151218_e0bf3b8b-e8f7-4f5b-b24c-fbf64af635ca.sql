SELECT cron.unschedule('teamcall-thursday-reminder') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'teamcall-thursday-reminder');
SELECT cron.unschedule('teamcall-sunday-summary')   WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'teamcall-sunday-summary');
SELECT cron.unschedule('teamcall-monday-reminder')  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'teamcall-monday-reminder');

DROP TABLE IF EXISTS public.sales_coach_aufnahmen CASCADE;
DROP TABLE IF EXISTS public.team_call_punkte      CASCADE;
DROP TABLE IF EXISTS public.team_call_protokolle  CASCADE;
DROP TABLE IF EXISTS public.team_call_settings    CASCADE;