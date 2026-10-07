-- ===========================================================================
-- Terminerinnerungen: Zeitplan schickt das Geheimwort der Automatiken mit
-- ===========================================================================
--
-- WARUM
--
-- send-termin-erinnerungen steht in config.toml mit verify_jwt = false und
-- war damit ohne Ausweis von aussen startbar. Seit dem 04.10.2026 prueft sie
-- wie die anderen Zeitplan-Functions den Ausweis aus automatikSchutz
-- (_shared/automatik-schutz.ts). Ihr Zeitplan (send-termin-erinnerungen-hourly
-- aus 20260804120000) schickt den Kopf x-internal-secret noch nicht mit.
-- Sobald AUTOMATIK_GEHEIMWORT in den Function-Secrets steht, wuerden die
-- Erinnerungen abgewiesen.
--
-- WAS DIESE MIGRATION TUT
--
-- Derselbe Umstellungsblock wie in 20261004110000, nur fuer diese Function.
-- Uhrzeit, Name und Rumpf bleiben gleich, ein abgeschalteter Zeitplan bleibt
-- abgeschaltet. Ohne Geheimwort im Tresor wird nichts angefasst. Zeitplaene,
-- die den Kopf schon haben, bleiben in Ruhe. Aendert keine Tabellendaten,
-- wiederholbar.
--
-- REIHENFOLGE
--
-- Vor dem Ausrollen von send-termin-erinnerungen ausfuehren. Der zusaetzliche
-- Kopf schadet der alten Function nicht. Braucht
-- public.automatik_geheimnis() aus 20260916130000.
-- ===========================================================================

DO $umstellung$
DECLARE
  _funktionen text[] := ARRAY[
    'send-termin-erinnerungen'
  ];
  _name text;
  _ids bigint[];
  _id bigint;
  _job RECORD;
  _neu text;
  _gefunden int;
  _umgestellt int := 0;
  _schon int := 0;
  _ohne_zeitplan text[] := ARRAY[]::text[];
  _geheimwort text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE WARNING 'pg_cron ist nicht installiert. Es wurde nichts geaendert.';
    RETURN;
  END IF;

  -- Ohne Geheimwort im Tresor wird nichts angefasst. Sonst truege jeder
  -- Zeitplan einen leeren Kopf, und in dem Moment, in dem die Function-Secrets
  -- gesetzt werden, stuenden alle Automatiken still.
  _geheimwort := public.automatik_geheimnis();
  IF _geheimwort = '' THEN
    RAISE WARNING 'Im Tresor liegt kein Geheimwort unter dem Namen AUTOMATIK_GEHEIMWORT. Es wurde KEIN Zeitplan geaendert.';
    RAISE WARNING 'Zuerst ausfuehren: select vault.create_secret(''<Geheimwort>'', ''AUTOMATIK_GEHEIMWORT'', ''Gemeinsames Geheimwort der Automatiken''); danach diese Migration erneut.';
    RETURN;
  END IF;

  FOREACH _name IN ARRAY _funktionen LOOP
    -- Erst die Nummern einsammeln, dann arbeiten. Waehrend der Schleife
    -- entstehen durch `cron.schedule` neue Zeilen in derselben Tabelle; ein
    -- Cursor darueber wuerde sie unter Umstaenden noch einmal ausliefern.
    SELECT array_agg(jobid ORDER BY jobid) INTO _ids
      FROM cron.job
     WHERE command LIKE '%/functions/v1/' || _name || '%';

    _gefunden := COALESCE(array_length(_ids, 1), 0);

    FOREACH _id IN ARRAY COALESCE(_ids, ARRAY[]::bigint[]) LOOP
      SELECT jobid, jobname, schedule, command, active
        INTO _job
        FROM cron.job
       WHERE jobid = _id;

      CONTINUE WHEN _job.jobid IS NULL;

      -- Schon umgestellt? Dann in Ruhe lassen. Das macht die Migration
      -- wiederholbar.
      IF _job.command LIKE '%x-internal-secret%' THEN
        _schon := _schon + 1;
        CONTINUE;
      END IF;

      -- Den Kopf-Ausdruck erweitern, sonst bleibt alles wie es ist. Der
      -- JSON-Text enthaelt nur doppelte Anfuehrungszeichen, deshalb ist
      -- [^''] eine sichere Grenze fuer das Literal.
      _neu := regexp_replace(
        _job.command,
        'headers\s*:=\s*''(\{[^'']*\})''::jsonb',
        'headers := (''\1''::jsonb || jsonb_build_object(''x-internal-secret'', public.automatik_geheimnis()))',
        'g'
      );

      IF _neu = _job.command THEN
        RAISE WARNING 'Zeitplan "%" (%): Der Kopf sieht anders aus als erwartet, er wurde NICHT geaendert. Bitte von Hand nachziehen, sonst faellt diese Automatik aus, sobald das Geheimwort gesetzt ist. Befehl: %',
          _job.jobname, _name, _job.command;
        CONTINUE;
      END IF;

      BEGIN
        PERFORM cron.unschedule(_job.jobname);
        PERFORM cron.schedule(_job.jobname, _job.schedule, _neu);

        -- Ein abgeschalteter Zeitplan bleibt abgeschaltet. cron.schedule legt
        -- ihn immer aktiv an, das waere sonst ein stilles Wiedereinschalten.
        IF NOT _job.active THEN
          PERFORM cron.alter_job(
            (SELECT jobid FROM cron.job WHERE jobname = _job.jobname),
            active := false
          );
          RAISE NOTICE 'Zeitplan "%" war abgeschaltet und bleibt es.', _job.jobname;
        END IF;

        _umgestellt := _umgestellt + 1;
        RAISE NOTICE 'Zeitplan "%" (%) schickt jetzt das Geheimwort mit.', _job.jobname, _name;
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Zeitplan "%" (%) konnte nicht umgestellt werden: %. Bitte von Hand nachziehen.',
          _job.jobname, _name, SQLERRM;
      END;
    END LOOP;

    IF _gefunden = 0 THEN
      _ohne_zeitplan := _ohne_zeitplan || _name;
    END IF;
  END LOOP;

  RAISE NOTICE 'Fertig: % Zeitplaene umgestellt, % waren es schon.', _umgestellt, _schon;

  IF array_length(_ohne_zeitplan, 1) > 0 THEN
    -- Kein Fehler, aber wissenswert: Zu diesen Functions gibt es in dieser
    -- Datenbank gar keinen Zeitplan. Entweder laufen sie nie, oder sie werden
    -- von aussen angestossen. Diese Migration erfindet bewusst keinen
    -- Zeitplan, denn sie kennt die richtige Uhrzeit nicht.
    RAISE WARNING 'Zu diesen Functions gibt es keinen Eintrag in cron.job: %. Sie laufen also entweder gar nicht, oder ihr Aufrufer sitzt woanders und muss den Kopf x-internal-secret selbst mitschicken.',
      array_to_string(_ohne_zeitplan, ', ');
  END IF;
END
$umstellung$;

-- Nachsehen (aendert nichts): Pruefzeile 80.1 in
-- supabase/migrations-inbox/99_PRUEFUNG.sql.
