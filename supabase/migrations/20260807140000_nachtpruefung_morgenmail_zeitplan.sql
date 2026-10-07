-- ===========================================================================
-- Zeitplan: die Befunde der Nachtprüfung gehen morgens als Mail hinaus
-- ===========================================================================
--
-- Der Nachtwächter schreibt seit seiner Einführung jede Nacht in
-- `nachtpruefung_befunde`, und gelesen hat sie niemand. Keine Seite im CRM
-- zeigte die Tabelle, `nachtpruefung_bericht()` war fertig und wurde von
-- nirgendwo gerufen, und nach 28 Tagen räumte der Lauf die Zeilen selbst
-- wieder weg. Es gab also eine vollständige Prüfung ohne einen einzigen
-- Leser.
--
-- Ab jetzt zwei Wege dorthin: eine Seite im CRM (/nachtpruefung) und diese
-- Morgenmail an Inhaber und Administratoren.
--
-- Uhrzeit: 4:30 UTC, also 6:30 deutscher Sommerzeit und 5:30 im Winter. Das
-- liegt sicher nach dem Nachtlauf (3:00 UTC) und vor dem ersten
-- Arbeitsbeginn. Fest auf UTC gesetzt wie die übrigen Zeitpläne dieses
-- Projekts; eine Umschaltung auf Sommerzeit wäre mehr Aufwand als Nutzen.
--
-- Die Function schickt nur dann etwas, wenn es tatsächlich Befunde gibt. Der
-- Zeitplan darf deshalb bedenkenlos täglich laufen.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'nachtpruefung-morgenmail') THEN
      PERFORM cron.unschedule('nachtpruefung-morgenmail');
    END IF;

    PERFORM cron.schedule(
      'nachtpruefung-morgenmail',
      '30 4 * * *',
      $cron$
      SELECT net.http_post(
        url := 'https://DEIN-SUPABASE-PROJEKT.supabase.co/functions/v1/nachtpruefung-morgenmail',
        headers := '{"Content-Type": "application/json"}'::jsonb,
        body := '{}'::jsonb
      );
      $cron$
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Zeitplan fuer die Nachtpruefungs-Morgenmail nicht gesetzt: %. Bitte von Hand anlegen.', SQLERRM;
END $$;

COMMENT ON TABLE public.nachtpruefung_befunde IS
  'Befunde der naechtlichen Systempruefung. Gelesen werden sie an zwei '
  'Stellen: von der Seite /nachtpruefung im CRM (nur Admin und Inhaber, per '
  'RLS erzwungen) und von der Edge Function nachtpruefung-morgenmail, die '
  'sie morgens als Bericht verschickt, sofern es etwas zu melden gibt.';
