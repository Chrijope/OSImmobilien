-- ===========================================================================
-- Die Zeitplaene schicken ab jetzt ein Geheimwort mit (Audit-Befund F08)
-- ===========================================================================
--
-- WARUM
--
-- In `supabase/config.toml` steht bei den Zeitplan-Functions
-- `verify_jwt = false`. Das muss so sein: pg_cron ruft ohne Anmeldetoken auf,
-- mit Anmeldepflicht bliebe jede Nacht ein 401 stehen. Der Preis dafuer ist,
-- dass jeder im Internet diese Adressen starten kann. Sie folgen einem festen
-- Schema, und viele stehen im Frontend-Code. Ein einziger Aufruf von aussen
-- verschickt Mails an echte Kunden und Bewerber oder schreibt in die Pipeline.
--
-- Die 18 betroffenen Functions verlangen ab sofort das Geheimwort aus der
-- Umgebungsvariable `AUTOMATIK_GEHEIMWORT` im Kopf `x-internal-secret`; der
-- gemeinsame Schutz steht in `supabase/functions/_shared/automatik-schutz.ts`.
-- Damit die Automatiken weiterlaufen, muessen die Zeitplaene dasselbe
-- Geheimwort mitschicken. Genau das macht diese Migration.
--
-- Der Kopf `x-internal-secret` ist der im Projekt uebliche, der Wert aber
-- bewusst ein eigener und nicht `INGEST_SHARED_SECRET`: Mit dem signieren
-- Lead-Partner ihre Aufrufe an `submit-lead`, und daran haengt der
-- Zapier-Eingang von `send-bewerber-kennenlernen`. Zwei Verwendungszwecke
-- gehoeren getrennt, und nur ein neuer Name ist garantiert noch nicht gesetzt.
-- Nur deshalb greift die Uebergangsregel in den Functions ueberhaupt.
--
-- WOHER DAS GEHEIMWORT IN DER DATENBANK KOMMT
--
-- Aus dem Tresor (`supabase_vault`), unter dem Namen `AUTOMATIK_GEHEIMWORT`.
-- Der Tresor ist im Projekt schon in Gebrauch: Die Migration
-- `20260517155943_email_infra.sql` legt die Erweiterung an und beschreibt,
-- dass dort der Service-Key fuer die Mailschlange liegt
-- (`email_queue_service_role_key`).
--
-- Die naheliegende Alternative waere `public.app_config` gewesen. Sie scheidet
-- aus: Auf dieser Tabelle steht die Policy "Alle lesen config" fuer die Rolle
-- `authenticated`. Jeder angemeldete Nutzer koennte das Geheimwort auslesen,
-- und damit waere es keines mehr. Ebenso wenig darf das Geheimwort im Befehl
-- des Zeitplans stehen: Der Befehl stuende dann im Klartext in `cron.job` und,
-- schlimmer, in dieser Datei hier und damit in git.
--
-- Deshalb der Umweg ueber die Lesefunktion `public.automatik_geheimnis()`.
-- Sie holt den Wert zur Laufzeit aus dem Tresor. Im Befehl des Zeitplans steht
-- nur ihr Name.
--
-- WAS GENAU GEAENDERT WIRD
--
-- Nur der Kopf der bestehenden Aufrufe. Diese Migration legt KEINEN neuen
-- Zeitplan an und aendert keine Uhrzeit. Sie sucht zu jeder der 18 Functions
-- die vorhandenen Eintraege in `cron.job` (ueber die Adresse im Befehl, nicht
-- ueber den Namen, denn einige sind von Hand im Supabase-Editor angelegt
-- worden und heissen anders) und ersetzt im Befehl
--
--     headers := '{"Content-Type": "application/json"}'::jsonb
-- durch
--     headers := ('{"Content-Type": "application/json"}'::jsonb
--                 || jsonb_build_object('x-internal-secret',
--                                       public.automatik_geheimnis()))
--
-- Alles Uebrige am Befehl bleibt unangetastet: Adresse, Rumpf, Wartezeit, ein
-- vorhandener Authorization-Kopf, auch Bedingungen um den Aufruf herum. Ein
-- Zeitplan, der nicht mehr laeuft (`active = false`), bleibt abgeschaltet.
--
-- REIHENFOLGE, DIE EINGEHALTEN WERDEN MUSS
--
--   1. Geheimwort in den Tresor legen (siehe unten, einmalig).
--   2. Diese Migration ausfuehren.
--   3. Die 18 Functions ausrollen.
--   4. Erst ganz zum Schluss `AUTOMATIK_GEHEIMWORT` in den Function-Secrets
--      setzen. Ab diesem Moment ist das Tor zu.
--
-- Schritt 4 zum Schluss, weil der Schutz in den Functions im Uebergang noch
-- durchlaesst, solange die Umgebungsvariable leer ist. Waere er sofort scharf,
-- stuenden zwischen den Schritten alle Automatiken still, und das waere
-- schlimmer als die Luecke. Laeuft diese Migration, bevor das Geheimwort im
-- Tresor liegt, aendert sie vorsichtshalber gar nichts und sagt das laut.
--
-- Das Geheimwort im Tresor und das in den Function-Secrets muessen Zeichen
-- fuer Zeichen gleich sein. Die Kontrollabfrage ganz unten vergleicht beide
-- ohne sie anzuzeigen, naemlich ueber Laenge und Pruefsumme.
--
-- EINMALIG, VOR DIESER MIGRATION, MIT EIGENEM WERT:
--
--   select vault.create_secret('HIER-DAS-GEHEIMWORT', 'AUTOMATIK_GEHEIMWORT',
--                              'Gemeinsames Geheimwort der Automatiken');
--
--   -- Liegt es schon dort, stattdessen aktualisieren:
--   select vault.update_secret(
--            (select id from vault.secrets where name = 'AUTOMATIK_GEHEIMWORT'),
--            'HIER-DAS-GEHEIMWORT');
--
-- Wiederholbar: Ein zweiter Lauf erkennt die bereits umgestellten Zeitplaene
-- am vorhandenen `x-internal-secret` und laesst sie in Ruhe.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1) Die Lesefunktion
-- ---------------------------------------------------------------------------
--
-- Bewusst NICHT `SECURITY DEFINER`: Sie laeuft mit den Rechten des Aufrufers.
-- Der Zeitplan laeuft als `postgres`, und nur diese Rolle kommt an den Tresor.
-- Eine `SECURITY DEFINER`-Funktion, die ein Geheimwort zurueckgibt, waere eine
-- offene Tuer, sobald ein GRANT verrutscht.
--
-- Der Fehlerabfang liefert im Zweifel den leeren Text statt abzubrechen. Ein
-- leerer Kopfwert ist waehrend des Uebergangs harmlos (die Function laesst
-- dann durch); ein Abbruch waere ein ausgefallener Nachtlauf.

CREATE OR REPLACE FUNCTION public.automatik_geheimnis()
RETURNS text
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  _wert text;
BEGIN
  SELECT decrypted_secret INTO _wert
    FROM vault.decrypted_secrets
   WHERE name = 'AUTOMATIK_GEHEIMWORT'
   ORDER BY created_at DESC
   LIMIT 1;

  RETURN COALESCE(_wert, '');
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'automatik_geheimnis: Tresor nicht lesbar (%). Die Automatiken rufen ohne Ausweis auf.', SQLERRM;
  RETURN '';
END;
$$;

COMMENT ON FUNCTION public.automatik_geheimnis() IS
  'Liest das gemeinsame Geheimwort der Automatiken aus dem Tresor (vault, Name AUTOMATIK_GEHEIMWORT). Wird allein von den pg_cron-Befehlen benutzt, um den Kopf x-internal-secret zu fuellen. Nicht fuer Anwendungsrollen.';

-- Niemand ausser der Eigentuemerrolle darf sie aufrufen. `anon` und
-- `authenticated` erben ihre Rechte von PUBLIC, deshalb beides.
REVOKE ALL ON FUNCTION public.automatik_geheimnis() FROM PUBLIC;
DO $$
BEGIN
  REVOKE ALL ON FUNCTION public.automatik_geheimnis() FROM anon, authenticated;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Rechte fuer anon/authenticated nicht entzogen: %. PUBLIC ist bereits entzogen.', SQLERRM;
END $$;


-- ---------------------------------------------------------------------------
-- 2) Die Zeitplaene umstellen
-- ---------------------------------------------------------------------------

DO $umstellung$
DECLARE
  _funktionen text[] := ARRAY[
    'check-document-reminders',
    'eigene-investments-reminders',
    'lead-eskalation-check',
    'mail-nachzuegler',
    'recompute-pipeline',
    'send-aftersales-beratung-reminders',
    'send-bewerber-closing-reminders',
    'send-bewerber-erstgespraech-reminders',
    'send-bewerber-formular-erinnerungen',
    'send-bewerber-kennenlernen-erinnerungen',
    'send-birthday-emails',
    'send-followup-overdue-nudges',
    'send-reservierung-eskalation',
    'send-sla-inactivity-nudges',
    'send-vertrag-hr-eskalation',
    'signatur-erinnerung',
    'system-health-check',
    'weekly-pipeline-mahnreport'
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


-- ===========================================================================
-- Kontrollabfragen. Sie aendern nichts.
--
-- 1. Welche Zeitplaene schicken das Geheimwort mit? Erwartet wird bei jedem
--    betroffenen Eintrag "ja".
--
--   select jobname, schedule, active,
--          case when command like '%x-internal-secret%' then 'ja' else 'FEHLT' end as geheimwort
--     from cron.job
--    order by jobname;
--
-- 2. Stimmt das Geheimwort im Tresor mit dem in den Function-Secrets ueberein?
--    Diese Abfrage zeigt es nicht an, sondern nur Laenge und Pruefsumme.
--    Dieselben zwei Werte muessen sich fuer den Wert ergeben, der unter
--    AUTOMATIK_GEHEIMWORT in den Function-Secrets steht.
--
--   select length(public.automatik_geheimnis()) as laenge,
--          left(md5(public.automatik_geheimnis()), 8) as pruefsumme;
--
-- 3. Sind die Naechte danach durchgelaufen? Erwartet wird "succeeded".
--
--   select j.jobname, r.status, r.return_message, r.start_time
--     from cron.job_run_details r
--     join cron.job j on j.jobid = r.jobid
--    where r.start_time > now() - interval '2 days'
--    order by r.start_time desc
--    limit 50;
-- ===========================================================================
