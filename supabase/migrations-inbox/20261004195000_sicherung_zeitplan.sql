-- ===========================================================================
-- Zeitplan fuer die naechtliche Sicherung (daily-backup)
-- ===========================================================================
--
-- WARUM
--
-- daily-backup hatte nie einen Zeitplan, die Sicherung lief also nie.
-- Christian hat am 04.10.2026 zugestimmt, dass sie jede Nacht laeuft.
-- daily-backup prueft seit dem 04.10.2026 automatikSchutz im strengen Modus:
-- Ohne den Kopf x-internal-secret mit dem Geheimwort weist es ab.
--
-- DER PAPIERKORB BLEIBT (Entscheidung Christian, 04.10.2026)
--
-- auto-purge-papierkorb bekommt bewusst KEINEN Zeitplan. Es wuerde Kontakte
-- nach 90 Tagen im Papierkorb endgueltig loeschen, samt Investments. Nichts
-- wird automatisch geloescht. Ein Zeitplan namens papierkorb-leeren-taeglich
-- wird entfernt, falls es ihn gibt. Die Function bleibt streng geschuetzt.
--
-- WAS DIE SICHERUNG TUT (gelesen am 04.10.2026)
--
-- Sie liest 14 Tabellen (kontakte, anrufe, aufgaben, benachrichtigungen,
-- chat_gruppen, chat_nachrichten, chat_teilnehmer, emails, lexikon, news,
-- pipeline, unterlagen_dokumente, unterlagen_highlights,
-- unterlagen_kategorien; zusammen rund 12 MB) und legt sie als JSON im nicht
-- oeffentlichen Eimer `backups` ab, ein Ordner je Tag. Ordner aelter als 30
-- Tage loescht sie selbst. Investments, Objekte und Wohnungen sind nicht
-- dabei.
--
-- UHRZEIT
--
-- pg_cron rechnet in UTC. 01:00 UTC ist 03:00 Sommerzeit und 02:00
-- Winterzeit, also immer nachts, und faellt nicht mit der naechtlichen
-- Abmeldung (jede Stunde zur halben Stunde) zusammen.
--
-- WAS DIESE MIGRATION TUT
--
-- Legt den Zeitplan sicherung-taeglich nach dem Muster der uebrigen an:
-- net.http_post an /functions/v1/daily-backup, Kopf mit apikey und
-- Authorization (oeffentlicher Schluessel, die Function verlangt eine
-- Anmeldung am Gateway) und x-internal-secret aus
-- public.automatik_geheimnis().
--
-- Der oeffentliche Schluessel steht nicht in dieser Datei. Er wird zur
-- Laufzeit aus einem vorhandenen Zeitplan gelesen, und nur ein Schluessel
-- mit der Rolle anon zaehlt. Das Geheimwort steht ebenfalls nicht im Befehl,
-- nur der Weg zu ihm. Ohne Geheimwort im Tresor oder ohne gefundenen
-- Schluessel legt sie nichts an und warnt. Wiederholbar: Ein vorhandener
-- Zeitplan gleichen Namens wird ersetzt. Aendert keine Tabellendaten.
--
-- REIHENFOLGE
--
-- Nach dem Ausrollen von daily-backup. Braucht public.automatik_geheimnis()
-- aus 20260916130000.
-- ===========================================================================

DO $zeitplan$
DECLARE
  _url text := 'https://irwdgutegmivbtgmftyc.supabase.co/functions/v1/daily-backup';
  _anon text;
  _kandidat text;
  _teil text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     OR NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    RAISE WARNING 'pg_cron oder pg_net fehlt. Es wurde nichts angelegt.';
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'papierkorb-leeren-taeglich') THEN
    PERFORM cron.unschedule('papierkorb-leeren-taeglich');
    RAISE NOTICE 'Zeitplan "papierkorb-leeren-taeglich" entfernt. Der Papierkorb bleibt bestehen.';
  END IF;

  IF public.automatik_geheimnis() = '' THEN
    RAISE WARNING 'Im Tresor liegt kein Geheimwort unter dem Namen AUTOMATIK_GEHEIMWORT. Es wurde KEIN Zeitplan angelegt.';
    RETURN;
  END IF;

  FOR _kandidat IN
    SELECT (regexp_match(command, 'apikey[^e]{1,8}(eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)'))[1]
      FROM cron.job
     ORDER BY jobid
  LOOP
    CONTINUE WHEN _kandidat IS NULL;
    BEGIN
      _teil := translate(split_part(_kandidat, '.', 2), '-_', '+/');
      _teil := rpad(_teil, ((length(_teil) + 3) / 4) * 4, '=');
      IF convert_from(decode(_teil, 'base64'), 'UTF8')::jsonb ->> 'role' = 'anon' THEN
        _anon := _kandidat;
        EXIT;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      CONTINUE;
    END;
  END LOOP;

  IF _anon IS NULL THEN
    RAISE WARNING 'In keinem vorhandenen Zeitplan steht ein oeffentlicher Schluessel (apikey, Rolle anon). Es wurde KEIN Zeitplan angelegt.';
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sicherung-taeglich') THEN
    PERFORM cron.unschedule('sicherung-taeglich');
  END IF;

  PERFORM cron.schedule(
    'sicherung-taeglich',
    '0 1 * * *',
    format(
      $befehl$SELECT net.http_post(url := %L, headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', %L, 'Authorization', %L, 'x-internal-secret', public.automatik_geheimnis()), body := '{}'::jsonb, timeout_milliseconds := 150000);$befehl$,
      _url,
      _anon,
      'Bearer ' || _anon
    )
  );
  RAISE NOTICE 'Zeitplan "sicherung-taeglich" (daily-backup) um 01:00 UTC angelegt.';
END
$zeitplan$;

-- Nachsehen (aendert nichts): Pruefzeilen 81.1 und 81.2 in
-- supabase/migrations-inbox/99_PRUEFUNG.sql.
