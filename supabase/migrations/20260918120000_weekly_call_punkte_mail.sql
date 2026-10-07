-- ===========================================================================
-- Weekly Sales Call: Die eingetragenen Punkte montags um 17 Uhr an die Leitung
-- ===========================================================================
--
-- Die Edge Function `send-weekly-call-punkte` schickt montags um 17 Uhr
-- deutscher Zeit die Punkte des heutigen Calls an die Moderation, damit sie
-- sich bis 19:00 beziehungsweise 19:30 vorbereiten kann. 17 Uhr ist der
-- Redaktionsschluss, den das CRM im Vorbereitungsbanner schon heute nennt
-- (`src/lib/weeklyCallVorbereitung.ts`, REDAKTIONSSCHLUSS_STUNDE).
--
-- Diese Migration macht zwei Dinge und sonst nichts:
--
--   1) Sie legt die Empfaengerliste an, vorerst leer.
--   2) Sie setzt den Zeitplan, zweimal, wegen der Zeitumstellung.
--
-- Mehrfach ausfuehrbar. Ein zweiter Durchlauf setzt eine bereits gepflegte
-- Empfaengerliste NICHT zurueck.
--
-- Nichts an den Tabellen `weekly_call_punkte` und `weekly_call_protokolle`
-- wird angefasst, keine Policy geaendert, keine Daten veraendert. Die Function
-- liest mit dem Service-Key und fragt `user_id` gar nicht erst ab: Die Punkte
-- bleiben anonym, auch in der Mail.
--
-- ---------------------------------------------------------------------------
-- 1) Die Empfaenger
-- ---------------------------------------------------------------------------
--
-- Bewusst eine gepflegte Liste und ausdruecklich KEINE Namen im Code, auch
-- keine Bestimmung ueber Rollen. Die Rollen `inhaber` und `admin` tragen
-- moeglicherweise mehr Leute als gedacht, und die bekaemen die internen
-- Wortmeldungen der Partner dann sofort mit, ohne dass jemand es entschieden
-- hat. Dieselbe Begruendung und dasselbe Muster wie beim Tagesbriefing
-- (20260915060000_tagesbriefing.sql).
--
-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │ WICHTIG: Die Liste ist absichtlich LEER angelegt.                       │
-- │ Solange sie leer ist, geht KEINE Mail hinaus. Erst die Zeile unter      │
-- │ "SO NIMMT MAN JEMANDEN AUF" schaltet den Versand scharf.                │
-- └─────────────────────────────────────────────────────────────────────────┘
--
-- Der Grund fuer die leere Vorbelegung: In dieser Mail steht, was Partner
-- vertraulich eingetragen haben. Wer sie liest, muss eine Entscheidung sein
-- und keine Voreinstellung aus einer Migration.
--
-- SO NIMMT MAN JEMANDEN AUF: Die vollstaendige neue Liste eintragen, nicht nur
-- die neue Adresse. Zeile anpassen und ausfuehren:
--
--     update public.app_config
--        set wert = '["name@example.org","zweite@example.org"]'::jsonb,
--            aktualisiert_am = now()
--      where schluessel = 'weekly_call_punkte_empfaenger';
--
-- SO NIMMT MAN JEMANDEN HERAUS: Dieselbe Zeile, nur ohne die Adresse.
--
-- SO SIEHT MAN DEN STAND:
--
--     select wert from public.app_config
--      where schluessel = 'weekly_call_punkte_empfaenger';
--
-- Fehlt der Eintrag, ist er leer oder kein Array, verschickt die Function
-- NICHTS und schreibt den Grund ins Protokoll. Sie faellt nicht auf eine im
-- Code stehende Adresse zurueck und auch nicht auf alle Administratoren.
--
-- `ON CONFLICT DO NOTHING` ist hier der ganze Punkt: Migrationen werden von
-- Hand ausgefuehrt und manchmal zweimal. Ein `DO UPDATE` wuerde beim zweiten
-- Mal eine inzwischen gepflegte Liste wieder leeren, und das faellt erst auf,
-- wenn jemand die Mail vermisst.

INSERT INTO public.app_config (schluessel, wert)
VALUES ('weekly_call_punkte_empfaenger', '[]'::jsonb)
ON CONFLICT (schluessel) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2) Der Zeitplan
-- ---------------------------------------------------------------------------
--
-- pg_cron laeuft in UTC und macht die Sommerzeit nicht mit. 17 Uhr deutscher
-- Zeit ist im Sommer 15:00 UTC und im Winter 16:00 UTC. Deshalb zwei
-- Eintraege, beide montags. Jeden Montag startet also auch der jeweils
-- falsche, und genau der bricht in der Function ab: Sie prueft die Berliner
-- Stunde selbst nach und tut nichts, wenn es dort nicht 17 Uhr ist. Dasselbe
-- Vorgehen wie in `send-weekly-summary` und `tagesbriefing`.
--
-- Zusaetzlich prueft die Function den Wochentag. Das faengt den Fall ab, dass
-- jemand den Cron-Ausdruck spaeter versehentlich auf alle Tage stellt.
--
-- Aufgeraeumt wird nicht nur ueber den Jobnamen, sondern ueber jeden Job,
-- dessen Befehl auf dieselbe Function zeigt. Ein von Hand angelegter Eintrag
-- wuerde sonst daneben weiterlaufen und die Mail ginge doppelt.

DO $$
DECLARE
  _eintrag RECORD;
  _alt RECORD;
  _url text := 'https://irwdgutegmivbtgmftyc.supabase.co/functions/v1/send-weekly-call-punkte';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron ist nicht installiert, der Zeitplan wurde nicht gesetzt.';
    RETURN;
  END IF;

  -- Erst alles entfernen, was auf diese Function zeigt.
  FOR _alt IN
    SELECT jobname FROM cron.job
     WHERE jobname IN ('weekly-call-punkte-sommer', 'weekly-call-punkte-winter')
        OR command LIKE '%/functions/v1/send-weekly-call-punkte%'
  LOOP
    BEGIN
      PERFORM cron.unschedule(_alt.jobname);
      RAISE NOTICE 'Alter Zeitplan "%" entfernt.', _alt.jobname;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Zeitplan "%" konnte nicht entfernt werden: %. Bitte von Hand loeschen, sonst geht die Mail doppelt.',
        _alt.jobname, SQLERRM;
    END;
  END LOOP;

  FOR _eintrag IN
    SELECT * FROM (VALUES
      ('weekly-call-punkte-sommer', '0 15 * * 1'),   -- 17:00 deutscher Sommerzeit
      ('weekly-call-punkte-winter', '0 16 * * 1')    -- 17:00 deutscher Winterzeit
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
  RAISE NOTICE 'Zeitplan fuer die Weekly-Call-Punkte nicht gesetzt: %. Bitte von Hand anlegen.', SQLERRM;
END $$;

-- ---------------------------------------------------------------------------
-- 3) Nachsehen
-- ---------------------------------------------------------------------------
--
-- Erwartet: eine Zeile mit [] (leer, bis jemand eingetragen wird), und zwei
-- Zeitplaneintraege.
--
--     select wert from public.app_config
--      where schluessel = 'weekly_call_punkte_empfaenger';
--
--     select jobname, schedule from cron.job
--      where jobname like 'weekly-call-punkte-%';
