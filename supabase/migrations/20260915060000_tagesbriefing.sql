-- ===========================================================================
-- Tagesbriefing der Geschaeftsleitung: Empfaengerliste und Zeitplan
-- ===========================================================================
--
-- Die Edge Function `tagesbriefing` schickt werktags um 8 Uhr deutscher Zeit
-- ein Lagebild aus allen Abteilungen an Christian. Diese Migration macht zwei
-- Dinge und sonst nichts:
--
--   1) Sie legt die Empfaengerliste an, vorbelegt mit genau einer Adresse.
--   2) Sie setzt den Zeitplan, zweimal, wegen der Zeitumstellung.
--
-- Mehrfach ausfuehrbar. Ein zweiter Durchlauf setzt eine bereits erweiterte
-- Empfaengerliste NICHT zurueck.
--
-- ---------------------------------------------------------------------------
-- 1) Die Empfaenger
-- ---------------------------------------------------------------------------
--
-- Bewusst eine gepflegte Liste und keine Bestimmung ueber Rollen. Die Rollen
-- `inhaber` und `admin` tragen moeglicherweise mehr Leute als gedacht, und die
-- bekaemen das Briefing dann sofort mit, ohne dass jemand es entschieden hat.
-- Eine Mail, die an einen ungewollten Kreis gegangen ist, laesst sich nicht
-- zurueckholen.
--
-- SO NIMMT MAN JEMANDEN AUF: Die vollstaendige neue Liste eintragen, nicht nur
-- die neue Adresse. Zeile kopieren, zweite Adresse ersetzen, ausfuehren:
--
--     update public.app_config
--        set wert = '["c.peetz@more.immo","zweite.adresse@more.immo"]'::jsonb,
--            aktualisiert_am = now()
--      where schluessel = 'tagesbriefing_empfaenger';
--
-- SO SIEHT MAN DEN STAND:
--
--     select wert from public.app_config
--      where schluessel = 'tagesbriefing_empfaenger';
--
-- Fehlt der Eintrag, ist er leer oder kein Array, verschickt die Function
-- NICHTS und schreibt den Grund ins Protokoll. Sie faellt nicht auf eine im
-- Code stehende Adresse zurueck und auch nicht auf alle Administratoren.
--
-- `ON CONFLICT DO NOTHING` ist hier der ganze Punkt: Christian fuehrt
-- Migrationen von Hand aus und manchmal zweimal. Ein `DO UPDATE` wuerde beim
-- zweiten Mal eine inzwischen erweiterte Liste wieder auf die eine Adresse
-- zurechtstutzen, und das faellt erst auf, wenn jemand die Mail vermisst.

INSERT INTO public.app_config (schluessel, wert)
VALUES ('tagesbriefing_empfaenger', '["c.peetz@more.immo"]'::jsonb)
ON CONFLICT (schluessel) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2) Der Zeitplan
-- ---------------------------------------------------------------------------
--
-- pg_cron laeuft in UTC und macht die Sommerzeit nicht mit. 8 Uhr deutscher
-- Zeit ist im Sommer 06:00 UTC und im Winter 07:00 UTC. Deshalb zwei
-- Eintraege, Montag bis Freitag. Jeden Tag startet also auch der jeweils
-- falsche, und genau der bricht in der Function ab: Sie prueft die Berliner
-- Stunde selbst nach und tut nichts, wenn es dort nicht 8 Uhr ist. Dasselbe
-- Vorgehen wie in `send-weekly-summary`.
--
-- Die Mail muss nach dem naechtlichen Kennzahlenlauf kommen. Der laeuft um
-- 04:10 UTC (20260908180000_kennzahlen_tagesstand.sql), also rund zwei Stunden
-- vorher. Das reicht mit grossem Abstand.
--
-- Aufgeraeumt wird nicht nur ueber den Jobnamen, sondern ueber jeden Job,
-- dessen Befehl auf dieselbe Function zeigt. Ein von Hand angelegter Eintrag
-- wuerde sonst daneben weiterlaufen und die Mail ginge doppelt.

DO $$
DECLARE
  _eintrag RECORD;
  _alt RECORD;
  _url text := 'https://irwdgutegmivbtgmftyc.supabase.co/functions/v1/tagesbriefing';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron ist nicht installiert, der Zeitplan wurde nicht gesetzt.';
    RETURN;
  END IF;

  -- Erst alles entfernen, was auf diese Function zeigt.
  FOR _alt IN
    SELECT jobname FROM cron.job
     WHERE jobname IN ('tagesbriefing-sommer', 'tagesbriefing-winter')
        OR command LIKE '%/functions/v1/tagesbriefing%'
  LOOP
    BEGIN
      PERFORM cron.unschedule(_alt.jobname);
      RAISE NOTICE 'Alter Zeitplan "%" entfernt.', _alt.jobname;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Zeitplan "%" konnte nicht entfernt werden: %. Bitte von Hand loeschen, sonst laeuft das Briefing doppelt.',
        _alt.jobname, SQLERRM;
    END;
  END LOOP;

  FOR _eintrag IN
    SELECT * FROM (VALUES
      ('tagesbriefing-sommer', '0 6 * * 1-5'),   -- 08:00 deutscher Sommerzeit
      ('tagesbriefing-winter', '0 7 * * 1-5')    -- 08:00 deutscher Winterzeit
    ) AS t(jobname, plan)
  LOOP
    PERFORM cron.schedule(
      _eintrag.jobname,
      _eintrag.plan,
      format(
        $cron$SELECT net.http_post(url := %L, headers := '{"Content-Type": "application/json"}'::jsonb, body := '{}'::jsonb);$cron$,
        _url
      )
    );
    RAISE NOTICE 'Zeitplan "%" gesetzt: % ruft %.', _eintrag.jobname, _eintrag.plan, _url;
  END LOOP;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Zeitplan fuer das Tagesbriefing nicht gesetzt: %. Bitte von Hand anlegen.', SQLERRM;
END $$;

-- ---------------------------------------------------------------------------
-- 3) Nachsehen
-- ---------------------------------------------------------------------------
--
-- Erwartet: eine Zeile mit ["c.peetz@more.immo"], und zwei Zeitplaneintraege.

SELECT schluessel, wert
  FROM public.app_config
 WHERE schluessel = 'tagesbriefing_empfaenger';

SELECT jobname, schedule, active
  FROM cron.job
 WHERE jobname LIKE 'tagesbriefing-%'
 ORDER BY jobname;
