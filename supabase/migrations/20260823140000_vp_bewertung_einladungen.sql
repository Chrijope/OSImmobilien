-- ===========================================================================
-- Bewertungseinladung eine Stunde nach dem Notartermin
-- ===========================================================================
--
-- Die Einladung zur Bewertung des Vertriebspartners gab es bereits, sie wurde
-- aber vom Browser des Kunden ausgeloest: Sie ging erst raus, wenn er sich ins
-- Kundenportal einloggte. Wer sich nie einloggt, wurde nie gefragt. Der
-- Dienst `send-vp-bewertung-einladungen` uebernimmt das jetzt serverseitig.
--
-- Er laeuft stuendlich und nimmt alle Investments, deren Notartermin zwischen
-- einer und 25 Stunden zurueckliegt. Die obere Grenze ist wichtig: Ohne sie
-- bekaemen beim ersten Lauf saemtliche Bestandskunden mit lange vergangenen
-- Terminen eine Mail. Die 25 Stunden decken zugleich einen ausgefallenen Lauf
-- mit ab.
--
-- Der Versand wird am Investment unter `meta.vpBewertungMailAt` vermerkt,
-- zusaetzlich greift der Idempotenzschluessel in send-transactional-email.
-- Eine eigene Sperrtabelle braucht es dadurch nicht.
--
-- Es gibt keine Schemaaenderung. Nur der Zeitplan wird gesetzt.

DO $$
DECLARE
  _alt RECORD;
  _url text := 'https://DEIN-SUPABASE-PROJEKT.supabase.co/functions/v1/send-vp-bewertung-einladungen';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron ist nicht installiert, der Zeitplan wurde nicht gesetzt.';
    RETURN;
  END IF;

  FOR _alt IN
    SELECT jobname FROM cron.job
     WHERE jobname = 'vp-bewertung-einladungen-hourly'
        OR command LIKE '%/functions/v1/send-vp-bewertung-einladungen%'
  LOOP
    BEGIN
      PERFORM cron.unschedule(_alt.jobname);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Zeitplan "%" konnte nicht entfernt werden: %.', _alt.jobname, SQLERRM;
    END;
  END LOOP;

  -- Minute 40. Die volle und die halbe Stunde sind bewusst gemieden, dort
  -- draengeln sich mehrere Jobs; am 03.08.2026 ist ein Job in diesem Gedraenge
  -- in einen DNS-Timeout gelaufen. Auch :05, :20 und :00 sind schon belegt.
  -- Aus demselben Grund 15 Sekunden Timeout statt der voreingestellten fuenf.
  PERFORM cron.schedule(
    'vp-bewertung-einladungen-hourly',
    '40 * * * *',
    format(
      $cron$SELECT net.http_post(url := %L, headers := '{"Content-Type": "application/json"}'::jsonb, body := '{}'::jsonb, timeout_milliseconds := 15000);$cron$,
      _url
    )
  );
  RAISE NOTICE 'Zeitplan "vp-bewertung-einladungen-hourly" gesetzt.';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Zeitplan nicht gesetzt: %. Bitte von Hand anlegen.', SQLERRM;
END $$;

-- Kontrolle:
--   SELECT jobname, schedule, active FROM cron.job
--    WHERE jobname = 'vp-bewertung-einladungen-hourly';
--
-- Wer hat die Einladung schon bekommen:
--   SELECT id, kunde_id, meta->>'vpBewertungMailAt' AS gesendet_am
--     FROM public.investments
--    WHERE meta ? 'vpBewertungMailAt'
--    ORDER BY meta->>'vpBewertungMailAt' DESC;
