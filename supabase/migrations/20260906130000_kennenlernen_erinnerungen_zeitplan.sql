-- ===========================================================================
-- Zeitplan für die Erinnerungskette des neuen Bewerberprozesses
-- ===========================================================================
--
-- Die Entscheidung, was fällig ist, steht seit dem Umbau des Bewerberprozesses
-- in `supabase/functions/_shared/kennenlernen-erinnerungen.ts`. Ausgeführt hat
-- sie bisher niemand: Der Bereich /bewerberprozess zeigte an, was fällig wäre,
-- verschickt wurde nichts. Diese Migration hängt den Zeitplan an die Function
-- `send-bewerber-kennenlernen-erinnerungen`, die den Versand übernimmt.
--
-- Was sie verschickt:
--
--   Tag 3   erste Erinnerung an den Bewerber, Mail
--   Tag 8   letzte Erinnerung, kündigt den Anruf an, Mail
--   Tag 11  Mitteilung an die Rolle hr, Glocke, keine dritte Mail
--   danach  nichts
--
-- ── Warum einmal täglich und nicht alle zehn Minuten ──
--
-- Die Kette rechnet in ganzen Tagen seit dem Versand der Einladung. Ein Takt
-- von zehn Minuten träfe deshalb genau die Uhrzeit, zu der die Einladung
-- hinausging: Wer sie um 23:40 Uhr bekommen hat, bekäme die Erinnerung drei
-- Tage später um 23:40 Uhr. Das ist keine freundliche Erinnerung, das ist eine
-- Maschine.
--
-- Ein täglicher Lauf am Morgen legt die Uhrzeit dagegen fest: Jede Erinnerung
-- kommt zur Bürozeit. Dass sie damit einen halben Tag später kommt als
-- rechnerisch möglich, ist gewollt und in der Sache ohne Bedeutung; die
-- Abstände sind mit drei und fünf Tagen ohnehin grob.
--
-- 07:30 UTC, also 09:30 Uhr deutscher Sommerzeit und 08:30 Uhr Winterzeit.
-- Bewusst versetzt zu den beiden anderen täglichen Bewerberläufen (07:00 Uhr
-- Vertragseskalation, 08:00 Uhr Fragebogen-Erinnerung): Drei Dienste, die zur
-- selben Minute dieselbe Tabelle lesen, sind ohne Not.
--
-- Der Lauf kostet wenig: Gelesen werden nur Bewerber, die einen
-- Kennenlernen-Block in ihrem Meta-Feld tragen, also die des neuen Ablaufs.
--
-- ── Doppelter Versand ──
--
-- Ein zweiter Lauf am selben Tag verschickt nichts doppelt. Jede verschickte
-- Nachricht hebt `meta.kennenlernen.erinnerungStufe`, und zusätzlich trägt
-- jede Mail einen Idempotenzschlüssel je Bewerber und Stufe. Ein Ausfall des
-- Zeitplans bleibt folgenlos, der nächste Morgen holt ihn nach.
--
-- Wie bei den übrigen Diensten wird vorher jeder Job entfernt, dessen Befehl
-- auf dieselbe Function zeigt, auch wenn er anders heißt. Ein von Hand im
-- Supabase-Editor angelegter Job liefe sonst neben dem neuen weiter.

DO $$
DECLARE
  _alt RECORD;
  _url text := 'https://irwdgutegmivbtgmftyc.supabase.co/functions/v1/send-bewerber-kennenlernen-erinnerungen';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron ist nicht installiert, der Zeitplan wurde nicht gesetzt.';
    RETURN;
  END IF;

  FOR _alt IN
    SELECT jobname FROM cron.job
     WHERE jobname = 'bewerber-kennenlernen-erinnerungen'
        OR command LIKE '%/functions/v1/send-bewerber-kennenlernen-erinnerungen%'
  LOOP
    BEGIN
      PERFORM cron.unschedule(_alt.jobname);
      RAISE NOTICE 'Alter Zeitplan "%" entfernt.', _alt.jobname;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Zeitplan "%" konnte nicht entfernt werden: %. Bitte von Hand loeschen, sonst laeuft der Dienst doppelt.',
        _alt.jobname, SQLERRM;
    END;
  END LOOP;

  PERFORM cron.schedule(
    'bewerber-kennenlernen-erinnerungen',
    '30 7 * * *',
    format(
      $cron$SELECT net.http_post(url := %L, headers := '{"Content-Type": "application/json"}'::jsonb, body := '{}'::jsonb);$cron$,
      _url
    )
  );
  RAISE NOTICE 'Zeitplan "bewerber-kennenlernen-erinnerungen" gesetzt: taeglich 07:30 UTC.';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Zeitplan nicht gesetzt: %. Bitte von Hand anlegen.', SQLERRM;
END $$;

-- Kontrolle nach dem Lauf: Die Zeile muss erscheinen und `active` sein.
--   SELECT jobname, schedule, active FROM cron.job
--    WHERE jobname = 'bewerber-kennenlernen-erinnerungen';
