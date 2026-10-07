-- ===========================================================================
-- Eskalation bei offenen Reservierungsvereinbarungen
-- ===========================================================================
--
-- An dieser Stelle ist bereits ein Objekt für den Kunden blockiert, aber es
-- gab keinerlei Nachfassen. Die vorhandene `signatur-erinnerung` ist
-- ausdrücklich auf Selbstauskünfte beschränkt, weil sie sonst die falsche
-- Überschrift trägt und das falsche Dokument verlinkt. Reservierungen fielen
-- damit vollständig durch.
--
-- Der neue Dienst `send-reservierung-eskalation` läuft täglich um 09:00 UTC,
-- also 11 Uhr deutscher Sommerzeit, und arbeitet vier Stufen ab:
--
--   Tag  2   Erinnerung an den Kunden, freundlich
--   Tag  5   Erinnerung an den Kunden, deutlicher
--   Tag 10   Erinnerung an den Kunden, mit Ausstiegsangebot
--   Tag 14   Aufgabe und Glocke für den zuständigen Berater
--
-- Je Lauf höchstens eine Stufe je Vorgang, der Stand steht in
-- `signature_requests.meta.eskalation`.
--
-- Zusätzlich laufen Reservierungslinks nicht mehr ab. Sieben Tage waren zu
-- knapp: Wer sich spät entscheidet, klickt ins Leere, und der Vorgang muss neu
-- aufgesetzt werden. Neue Links bekommen zehn Jahre (siehe
-- send-reservation-signature), und die bestehenden offenen werden hier
-- nachgezogen. Die Spalte ist NOT NULL, deshalb ein weit entfernter Zeitpunkt
-- statt eines leeren Werts.

-- ── Bestehende offene Reservierungslinks verlängern ──

UPDATE public.signature_requests
   SET expires_at = now() + interval '10 years'
 WHERE status = 'pending'
   AND person_type LIKE 'rv_%'
   AND expires_at < now() + interval '10 years';

-- ── Zeitplan ──

DO $$
DECLARE
  _alt RECORD;
  _url text := 'https://DEIN-SUPABASE-PROJEKT.supabase.co/functions/v1/send-reservierung-eskalation';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron ist nicht installiert, der Zeitplan wurde nicht gesetzt.';
    RETURN;
  END IF;

  FOR _alt IN
    SELECT jobname FROM cron.job
     WHERE jobname = 'reservierung-eskalation'
        OR command LIKE '%/functions/v1/send-reservierung-eskalation%'
  LOOP
    BEGIN
      PERFORM cron.unschedule(_alt.jobname);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Zeitplan "%" konnte nicht entfernt werden: %.', _alt.jobname, SQLERRM;
    END;
  END LOOP;

  PERFORM cron.schedule(
    'reservierung-eskalation',
    '0 9 * * *',
    format(
      $cron$SELECT net.http_post(url := %L, headers := '{"Content-Type": "application/json"}'::jsonb, body := '{}'::jsonb);$cron$,
      _url
    )
  );
  RAISE NOTICE 'Zeitplan "reservierung-eskalation" gesetzt.';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Zeitplan nicht gesetzt: %. Bitte von Hand anlegen.', SQLERRM;
END $$;

-- Kontrolle:
--   SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'reservierung-eskalation';
--   SELECT count(*) FROM public.signature_requests
--    WHERE status = 'pending' AND person_type LIKE 'rv_%' AND expires_at < now();
-- Die zweite Abfrage muss 0 ergeben.
