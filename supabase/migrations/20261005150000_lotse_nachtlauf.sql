-- Nächtlicher Durchlauf für den MORE Lotsen (05.10.2026).
-- Jede Nacht um 01:00 UTC (03:00 Sommerzeit) kommen alle Objekte einmal in die
-- Warteschlange. Der Zeitplan „lotse-unterlagen-auswerten“ überspringt alles,
-- was schon einen Auszug hat; KI-Guthaben kosten nur neue, geänderte oder vor
-- mehr als 24 Stunden gescheiterte Unterlagen. Ersetzt den ausgeblendeten
-- Knopf „Lotse: Unterlagen auswerten“ auf der Objekte-Seite.
-- Am 05.10.2026 direkt in Lovable angelegt; hier für die Historie, wiederholbar.
DO $$
BEGIN
  IF to_regclass('public.lotse_auswertung_warteschlange') IS NULL THEN
    RAISE EXCEPTION 'Zuerst 20261005123000_lotse_auswertung_warteschlange.sql ausführen.';
  END IF;
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'lotse-unterlagen-nachts';
  PERFORM cron.schedule(
    'lotse-unterlagen-nachts',
    '0 1 * * *',
    $job$INSERT INTO public.lotse_auswertung_warteschlange (objekt_id)
    SELECT o.id FROM public.objekte o
    WHERE NOT EXISTS (SELECT 1 FROM public.lotse_auswertung_warteschlange w WHERE w.objekt_id = o.id)$job$
  );
END $$;

SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'lotse-unterlagen-nachts';
