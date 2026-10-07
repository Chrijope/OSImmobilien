-- Geburtstagsmails: den fehlenden Auslöser anlegen
--
-- Die Edge Function send-birthday-emails existiert seit Monaten und ist
-- funktionsfähig, aber nichts hat sie jemals aufgerufen: kein Cron-Job, kein
-- Aufruf im Code, null Treffer in 830.000 protokollierten Job-Läufen. Es
-- wurde deshalb noch nie eine Geburtstagsmail versendet.
--
-- Dieser Job ruft sie täglich um 06:30 UTC auf, also 07:30 im Winter und
-- 08:30 im Sommer deutscher Zeit. Die Function vergleicht Tag und Monat mit
-- der Serverzeit (UTC); am Vormittag ist das UTC-Datum gleich dem deutschen,
-- die Uhrzeit ist dafür also unkritisch. Gegen Doppelversand schützt der
-- Idempotenzschlüssel je Empfänger und Tag.
--
-- Der Authorization-Kopf trägt den öffentlichen Publishable-Schlüssel. Die
-- anderen Reminder-Jobs rufen ihre Functions ohne Kopf auf und verlassen sich
-- darauf, dass verify_jwt = false eingespielt ist. Hier ist beides gesetzt,
-- damit der Aufruf auch dann nicht scheitert, wenn die Konfiguration der
-- Function nachzieht.

SELECT cron.schedule(
  'send-birthday-emails-daily',
  '30 6 * * *',
  $$
  SELECT net.http_post(
    url := 'https://DEIN-SUPABASE-PROJEKT.supabase.co/functions/v1/send-birthday-emails',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer DEIN-ANON-KEY"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
