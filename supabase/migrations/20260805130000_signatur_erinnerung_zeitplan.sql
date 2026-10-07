-- ===========================================================================
-- Zeitplan: erinnern, bevor eine Unterschrift abläuft
-- ===========================================================================
--
-- Der Nachtwächter hat beim ersten Lauf zehn abgelaufene
-- Unterschriftsanfragen gefunden: zehn Kunden, die einen Link bekommen und
-- nie unterschrieben haben, ohne dass jemand nachgefasst hätte.
--
-- Melden allein reicht dafür nicht. Die Function `signatur-erinnerung`
-- erinnert 24 Stunden vor Ablauf den Kunden und legt beim Ablauf eine Aufgabe
-- für den zuständigen Berater an. Beides genau einmal.
--
-- Täglich um 8:20 Uhr deutscher Zeit, also kurz nach dem Arbeitsbeginn: Eine
-- Erinnerung, die nachts um drei ankommt, liegt morgens unter allem anderen.
-- Die Datenbank rechnet in UTC, deshalb 6:20 UTC (Sommerzeit 8:20, Winterzeit
-- 7:20). Fest gesetzt, eine Umschaltung wäre mehr Aufwand als Nutzen.
--
-- Die Uhrzeit liegt bewusst fünf Minuten nach dem bestehenden Lauf für die
-- Investment-Erinnerungen, damit nicht beide gleichzeitig auf den Mailversand
-- gehen.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'signatur-erinnerung-daily') THEN
      PERFORM cron.unschedule('signatur-erinnerung-daily');
    END IF;

    PERFORM cron.schedule(
      'signatur-erinnerung-daily',
      '20 6 * * *',
      $cron$
      SELECT net.http_post(
        url := 'https://DEIN-SUPABASE-PROJEKT.supabase.co/functions/v1/signatur-erinnerung',
        headers := '{"Content-Type": "application/json"}'::jsonb,
        body := '{}'::jsonb
      );
      $cron$
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Zeitplan fuer die Signatur-Erinnerung nicht gesetzt: %. Bitte von Hand anlegen.', SQLERRM;
END $$;

-- ---------------------------------------------------------------------------
-- Der Nachtwächter meldet jetzt auch, was daraus geworden ist
-- ---------------------------------------------------------------------------
--
-- Ohne diese Ergänzung sähe man morgens weiter nur die Zahl der abgelaufenen
-- Unterschriften, aber nicht, ob jemand sich darum kümmert. Die Prüfung
-- unterscheidet deshalb zwischen "abgelaufen und niemand zuständig" und
-- "abgelaufen, aber eine Aufgabe liegt beim Berater".

COMMENT ON FUNCTION public.nachtpruefung_lauf() IS
  'Naechtliche Pruefung der Daten auf Luecken, Haenger und stille Fehler. '
  'Befunde in nachtpruefung_befunde, Bericht ueber nachtpruefung_bericht(). '
  'Abgelaufene Unterschriften werden zusaetzlich taeglich von der Function '
  'signatur-erinnerung aufgegriffen, die dem zustaendigen Berater eine '
  'Aufgabe anlegt.';
