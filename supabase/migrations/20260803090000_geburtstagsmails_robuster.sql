-- Geburtstagsmails: aus dem Gedränge verlegen und mehr Geduld geben
--
-- Der erste Lauf des Jobs aus 20260802220000 am 03.08.2026 um 06:30 UTC hat
-- den Server nie erreicht. Zu dieser Minute feuern mehrere Zeitpläne
-- gleichzeitig, und zwei der vier Aufrufe dieser Sekunde liefen bei der
-- Namensauflösung in den Standard-Timeout von 5000 ms (net._http_response:
-- "Timeout of 5000 ms reached", die gesamte Zeit entfiel auf DNS). Die
-- übrigen Aufrufe derselben Minute kamen durch, es ist also das Gedränge,
-- nicht die Adresse.
--
-- Deshalb zwei Änderungen: Der Job läuft um 06:35 statt 06:30, wo sonst
-- nichts feuert, und der Aufruf bekommt 15 Sekunden statt fünf.

SELECT cron.unschedule('send-birthday-emails-daily');

SELECT cron.schedule(
  'send-birthday-emails-daily',
  '35 6 * * *',
  $$
  SELECT net.http_post(
    url := 'https://DEIN-SUPABASE-PROJEKT.supabase.co/functions/v1/send-birthday-emails',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer DEIN-ANON-KEY"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 15000
  );
  $$
);
