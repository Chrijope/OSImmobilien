-- ===========================================================================
-- Sammeldatei: alles, was in Supabase noch laufen muss
-- ===========================================================================
--
-- STAND 07.10.2026: DREIUNDZWANZIG TEILE OFFEN. Neu ganz unten: sa_fester_link (nach absicherung_lesen, danach send-sa-invitation, send-sa-abbrecher-reminder, submit-sa-signature und finalize-selbstauskunft ausrollen). Davor neu: weekly_call_zwei_runden (Reihenfolge egal, danach send-weekly-call-punkte ausrollen). Neu: provision_intern_sperren (Reihenfolge egal, aendert Bestandsdaten nach vollstaendiger Kopie). Neu: rv_link_nach_aufheben (Reihenfolge egal). Neu ganz unten: lotse_auswertung_warteschlange (erst objekt-lotse ausrollen). Davor: expose_lesen_nach_kundenzugriff (Reihenfolge egal, am besten nach dem Publish). Neu: kundenlink_wohnungsauswahl (vor dem Ausrollen von get-kundenansicht und send-kunden-expose). Neu: absicherung_lesen (erst
-- redeem-activation-token ausrollen, dann Publish). objekt_sichtbarkeit_schalter und
-- abrechnung_nur_backoffice (Reihenfolge egal), dazu wochenberichte_geheimwort
-- und registrierung_ohne_rollenwahl, termin_erinnerungen_kopf (vor dem
-- Ausrollen von send-termin-erinnerungen), benachrichtigungen_sperre_eindeutig
-- (Reihenfolge egal), einreichung_upload_server (erst nach Ausrollen von
-- submit-objekt-einreichung und Publish) und sicherung_zeitplan (erst nach
-- Ausrollen von daily-backup; der Papierkorb bekommt bewusst keinen
-- Zeitplan), dazu ganz unten kundenportal_sperre_nachziehen (am besten nach
-- dem Ausrollen von kundenportal-sperre, secure-login, invite-user), eigentuemer_aus_investment
-- und buchhaltung_kundenprofil_pipeline (Reihenfolge egal). Am 05.10.2026
-- neu ganz unten: kundenlink_wohnungsauswahl (danach erst get-kundenansicht,
-- dann send-kunden-expose ausrollen). Fuer
-- wochenberichte_geheimwort und registrierung_ohne_rollenwahl gilt eine feste
-- Reihenfolge:
--   1. wochenberichte_geheimwort ausfuehren
--   2. in Lovable ausrollen: invite-user, setup-admin, create-test-accounts,
--      send-weekly-summary, send-weekly-vp-summary
--   3. erst danach registrierung_ohne_rollenwahl ausfuehren (sonst bekommen
--      neu eingeladene Partner und Mitarbeiter nur die Rolle kunde)
--
-- Am 30.09.2026 ausgefuehrt und hier entfernt: absicherung_stufe0,
-- absicherung_geld_vertraege, absicherung_objekte_speicher_chats,
-- abschluss_nur_backoffice, lead_pakete, terminseite_dauer.
--
-- Am 29.09.2026 ausgefuehrt und hier entfernt: glocke_ohne_zustaendigen_an_leitung,
-- glocke_nur_an_zustaendigen, partnertermin_umlaute, zoom_tabellen_entfernen,
-- signaturanfragen_nur_serverseitig, provisionssatz_ab_reservierung,
-- provisionssatz_nachtrag, partnertermin_nur_partner.
--
-- Am 28.09.2026 ausgefuehrt und hier entfernt: objekt_lotse,
-- support_antworten_melden, lead_rueckgabe_an_zentrale, glocke_absichern,
-- lead_rueckgabe_ohne_lesesperre, kennung_statt_name, notiz_favoriten,
-- handbuch_sa_direkt, sa_link_nur_offen_lesbar.
--
-- Am 27.09.2026 ausgefuehrt und hier entfernt: profil_sperre_absichern,
-- tippgeber_einverstaendnis, meta_pixel_berechtigung,
-- bewerbungen_nur_bewerberbereich, marketing_einwilligung_schuetzen,
-- gegenzeichnung_token_erneuern, marketing_einwilligungen_liste,
-- videocall_nur_geschaeftsfuehrer.
--
-- Am 26.09.2026 ausgefuehrt und hier entfernt: reservierung_kunde_lesen, person2_unterlagen_lesen, handbuch_seite,
-- handbuch_stand_und_leitung, naechtliche_abmeldung, aufgaben_abgesagt_nicht_offen,
-- handbuch_partner_schalter_und_kuerzel, kontakte_zusammenfuehren,
-- partnerlinks_absichern, kontakt_dateipfade_umschreiben.
--
-- Am 25.09.2026 ausgefuehrt und hier entfernt: finanzierung_intern_frei,
-- kundensprache_signatur_rpcs, kundensprache_zum_link,
-- kunden_zwei_faktor_freiwillig.
--
-- Am 24.09.2026 ausgefuehrt und hier entfernt: globalobjekt_eine_wahrheit,
-- dokument_kundenfreigabe, kundenlink_objektuebersicht, kundenportal_sperre,
-- investagon_unterlagen_einordnen, reservierung_unterschrieben_empfaenger,
-- nachtpruefung_objektdaten, standort_nachholen_zeitplan,
-- steuerrechner_vp_freigeben, steuerrechner_vertriebsleitung_freigeben.
--
-- Sobald eine neue Migration entsteht, wird sie hier unten angehaengt, in der
-- Reihenfolge, in der sie laufen soll.
--
-- EINE LEHRE VOM 19.09.2026
--
-- Wer mehrere Teile aus dieser Datei in den SQL-Editor kopiert, achte auf den
-- Zeilenumbruch dazwischen. Klebt das `BEGIN;` des naechsten Teils direkt an
-- der letzten Zeile des vorigen, liest Postgres beides als ein Wort und meldet
-- eine Spalte, die es nicht gibt ("column teilnehmerbegin does not exist").
-- Im Zweifel jeden Teil einzeln ausfuehren.
--
-- Die maszgebliche Historie bleibt `supabase/migrations/`. Dieser Ordner ist
-- nur die Merkliste dessen, was dort noch nicht in der Datenbank angekommen
-- ist. Die Pruefdateien 95_ bis 99_ bleiben dauerhaft liegen, sie sind keine
-- Migrationen und aendern nichts. Nach dem Ausfuehren zeigt 99_PRUEFUNG.sql,
-- ob alles angekommen ist.
-- ===========================================================================
-- Teil: 20260930160000_objekt_sichtbarkeit_schalter.sql
-- ===========================================================================

-- ===========================================================================
-- Sichtbarkeitsschalter fuer Investagon-Objekte (Punkt auf der Objektkachel)
-- ===========================================================================
--
-- Steht fuer sich, Reihenfolge egal, keine Function auszurollen, aendert
-- keine Daten, wiederholbar.
--
-- GL am 30.09.2026: Admin, Inhaber und Objektpartner entscheiden per
-- Klick auf den Punkt der Objektkachel, ob ein aus Investagon uebernommenes
-- Objekt fuer die Vertriebspartner sichtbar ist (gruen) oder nicht (orange).
--
-- WARUM EINE FUNKTION
--
-- Seit 20260930120000 aendern `objekte` direkt nur Admin, Inhaber und die
-- Rolle objektpartner am eigenen Objekt (`erstellt_von`). Investagon-Objekte
-- legt der Import mit der Dienstrolle an, `erstellt_von` ist leer, ein
-- Objektpartner koennte den Punkt also nie umschalten. Eine allgemeine
-- UPDATE-Regel fuer Objektpartner wuerde ihm dagegen jede Spalte oeffnen.
-- Diese Funktion aendert genau eine Spalte, `sichtbar`, und nur bei
-- Investagon-Objekten. Selbst angelegte Objekte behalten ihren Weg ueber die
-- Objektseite.
--
-- Die Datenbank kennt die in der Seitenleiste gewaehlte aktive Rolle nicht.
-- Geprueft wird deshalb, ob die Person eine der drei Rollen besitzt; die
-- Oberflaeche zeigt den Schalter nur in der aktiven Rolle Admin, Inhaber
-- oder Objektpartner.
--
-- Der Import fasst die Spalte bei bestehenden Objekten nicht an, ausser bei
-- seinen eigenen alten Ausblendungen mit Vermerk `meta.investagonAusblendung`
-- (siehe `investagon-import/sichtbarkeit.ts`). Eine Ausblendung von Hand
-- bleibt also stehen.
--
-- Ohne diese Migration schalten Admin und Inhaber trotzdem (direkter Weg),
-- Objektpartner bekommen eine Meldung, dass die Datenbank ablehnt.

BEGIN;

CREATE OR REPLACE FUNCTION public.objekt_sichtbarkeit_setzen(p_objekt_id uuid, p_sichtbar boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_meta jsonb;
BEGIN
  IF v_uid IS NULL OR p_objekt_id IS NULL OR p_sichtbar IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'grund', 'keine_berechtigung');
  END IF;

  IF NOT (public.is_admin_role(v_uid)
          OR public.has_role(v_uid, 'objektpartner'::public.app_role)) THEN
    RETURN jsonb_build_object('ok', false, 'grund', 'keine_berechtigung');
  END IF;

  SELECT coalesce(o.meta, '{}'::jsonb) INTO v_meta
    FROM public.objekte o
   WHERE o.id = p_objekt_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'grund', 'nicht_gefunden');
  END IF;

  -- Dieselbe Erkennung wie `ausInvestagon` in src/lib/investagonHerkunft.ts.
  IF NOT (
       jsonb_typeof(v_meta -> 'investagonRaw') = 'object'
    OR nullif(v_meta ->> 'investagonId', '') IS NOT NULL
    OR nullif(v_meta ->> 'investagonVollSyncVersion', '') IS NOT NULL
    OR nullif(v_meta ->> 'api_property_id', '') IS NOT NULL
  ) THEN
    RETURN jsonb_build_object('ok', false, 'grund', 'kein_investagon_objekt');
  END IF;

  UPDATE public.objekte SET sichtbar = p_sichtbar WHERE id = p_objekt_id;
  RETURN jsonb_build_object('ok', true, 'sichtbar', p_sichtbar);
END;
$$;

REVOKE ALL ON FUNCTION public.objekt_sichtbarkeit_setzen(uuid, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.objekt_sichtbarkeit_setzen(uuid, boolean) TO authenticated;

COMMIT;

-- ===========================================================================
-- Teil: 20261001120000_abrechnung_nur_backoffice.sql
-- ===========================================================================

-- ===========================================================================
-- Stufe "abrechnung" wie "abgeschlossen": nur Admin, Inhaber, Backoffice, Buchhaltung
-- ===========================================================================
--
-- CHRISTIANS ENTSCHEIDUNG (01.10.2026)
--
--   Die Pipelinestufe "abrechnung" setzt ein Vertriebspartner nicht selbst.
--   Es gelten genau die Regeln der Stufe "abgeschlossen" aus 20260930150000.
--   Ergaenzt am selben Tag: Auch die Buchhaltung setzt beide Stufen.
--
-- WAS DIESE MIGRATION TUT
--
-- Ersetzt nur den Rumpf von pipeline_abschluss_schuetzen(). Der Waechter
-- trg_absicherung_pipeline_abschluss auf investments und kontakte
-- (meta.pipelineStufe) prueft jetzt beide Stufen:
--   - Wechsel AUF oder AUS 'abrechnung' bzw. 'abgeschlossen' nur fuer Admin,
--     Inhaber (is_admin_role), Backoffice und Buchhaltung (has_role) und den Server
--     (auth.uid() IS NULL: Edge Functions mit Dienstschluessel, pg_cron,
--     SQL-Editor).
--   - Sonst bleibt der gespeicherte Wert stehen, ohne Abbruch.
--   - Der Wechsel abrechnung -> abgeschlossen bleibt fuer Backoffice und Buchhaltung frei.
-- Die Trigger werden zur Sicherheit wortgleich neu angelegt, damit die Datei
-- auch fuer sich allein laeuft.
--
-- WER "abrechnung" HEUTE SETZT
--
--   - Abwicklungskarte: Backoffice (oder Admin, Inhaber) hakt
--     "Provisionsrechnung gestellt" ab, der Browser setzt Investment und
--     Kontakt auf 'abrechnung'. Laeuft weiter.
--   - Admin und Inhaber von Hand (Fortschrittsleiste, Pipeline). Laeuft weiter.
--   - Keine Datenbankfunktion und keine Edge Function setzt 'abrechnung';
--     bulk_recompute_pipeline schaltet nur auf 'faelligkeit' und laeuft
--     ohnehin als Server.
--
-- Steht fuer sich: braucht nur is_admin_role und has_role. Ohne sie sperrt
-- nur die Oberflaeche. Aendert keine Daten, wiederholbar.
-- ===========================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.pipeline_abschluss_schuetzen()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _neu_meta jsonb := CASE WHEN jsonb_typeof(NEW.meta) = 'object' THEN NEW.meta ELSE '{}'::jsonb END;
  _alt_wert jsonb;
  _alt text;
  _neu text := _neu_meta ->> 'pipelineStufe';
BEGIN
  IF TG_OP = 'UPDATE' AND jsonb_typeof(OLD.meta) = 'object' THEN
    _alt_wert := OLD.meta -> 'pipelineStufe';
    _alt := OLD.meta ->> 'pipelineStufe';
  END IF;

  IF _alt IS NOT DISTINCT FROM _neu THEN
    RETURN NEW;
  END IF;
  IF coalesce(_alt, '') NOT IN ('abrechnung', 'abgeschlossen')
     AND coalesce(_neu, '') NOT IN ('abrechnung', 'abgeschlossen') THEN
    RETURN NEW;
  END IF;
  IF auth.uid() IS NULL
     OR public.is_admin_role(auth.uid())
     OR public.has_role(auth.uid(), 'backoffice'::public.app_role)
     OR public.has_role(auth.uid(), 'buchhaltung'::public.app_role) THEN
    RETURN NEW;
  END IF;

  RAISE LOG '%.%: Wechsel der Stufe % -> % verworfen (abrechnung und abgeschlossen nur Admin, Inhaber, Backoffice, Buchhaltung)',
    TG_TABLE_NAME, NEW.id, coalesce(_alt, '-'), coalesce(_neu, '-');

  IF _alt_wert IS NULL THEN
    NEW.meta := _neu_meta - 'pipelineStufe';
  ELSE
    NEW.meta := _neu_meta || jsonb_build_object('pipelineStufe', _alt_wert);
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.pipeline_abschluss_schuetzen() IS
  'meta.pipelineStufe auf oder aus ''abrechnung'' und ''abgeschlossen'' nur Admin, '
  'Inhaber, Backoffice, Buchhaltung und Server; sonst bleibt der gespeicherte Wert. '
  'Siehe 20260930150000 und 20261001120000.';

DROP TRIGGER IF EXISTS trg_absicherung_pipeline_abschluss ON public.investments;
CREATE TRIGGER trg_absicherung_pipeline_abschluss
BEFORE INSERT OR UPDATE OF meta ON public.investments
FOR EACH ROW
EXECUTE FUNCTION public.pipeline_abschluss_schuetzen();

DROP TRIGGER IF EXISTS trg_absicherung_pipeline_abschluss ON public.kontakte;
CREATE TRIGGER trg_absicherung_pipeline_abschluss
BEFORE INSERT OR UPDATE OF meta ON public.kontakte
FOR EACH ROW
EXECUTE FUNCTION public.pipeline_abschluss_schuetzen();

REVOKE ALL ON FUNCTION public.pipeline_abschluss_schuetzen() FROM PUBLIC, anon, authenticated;

COMMIT;

-- Nachsehen (aendert nichts): Pruefzeile 56.1 in
-- supabase/migrations-inbox/99_PRUEFUNG.sql.

-- ===========================================================================
-- Teil: 20261004110000_wochenberichte_geheimwort.sql
-- ===========================================================================

-- ===========================================================================
-- Wochenberichte: Zeitplaene schicken das Geheimwort der Automatiken mit
-- ===========================================================================
--
-- WARUM
--
-- send-weekly-summary und send-weekly-vp-summary pruefen seit dem 04.10.2026
-- wie die anderen Zeitplan-Functions den Ausweis aus automatikSchutz
-- (_shared/automatik-schutz.ts). In 20260916130000 standen die beiden nicht
-- in der Liste, ihre Zeitplaene schicken den Kopf x-internal-secret also
-- noch nicht mit. Sobald AUTOMATIK_GEHEIMWORT in den Function-Secrets steht,
-- wuerden die Wochenberichte abgewiesen.
--
-- WAS DIESE MIGRATION TUT
--
-- Derselbe Umstellungsblock wie in 20260916130000, nur fuer diese beiden
-- Functions: Der Kopf-Ausdruck im Befehl in cron.job bekommt
-- x-internal-secret aus public.automatik_geheimnis() dazu. Uhrzeit, Name und
-- Rumpf bleiben gleich, ein abgeschalteter Zeitplan bleibt abgeschaltet.
-- Ohne Geheimwort im Tresor wird nichts angefasst. Zeitplaene, die den Kopf
-- schon haben, bleiben in Ruhe. Aendert keine Tabellendaten, wiederholbar.
--
-- REIHENFOLGE
--
-- Vor dem Ausrollen von send-weekly-summary und send-weekly-vp-summary
-- ausfuehren. Der zusaetzliche Kopf schadet den alten Functions nicht.
-- Braucht public.automatik_geheimnis() aus 20260916130000.
-- ===========================================================================

DO $umstellung$
DECLARE
  _funktionen text[] := ARRAY[
    'send-weekly-summary',
    'send-weekly-vp-summary'
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

-- Nachsehen (aendert nichts): Pruefzeile 57.1 in
-- supabase/migrations-inbox/99_PRUEFUNG.sql.

-- ===========================================================================
-- Teil: 20261004120000_registrierung_ohne_rollenwahl.sql
-- ===========================================================================

-- ===========================================================================
-- Registrierung ohne Rollenwahl: handle_new_user liest die Rolle nur noch
-- aus raw_app_meta_data
-- ===========================================================================
--
-- DIE LUECKE (live bestaetigt am 04.10.2026)
--
-- Der Trigger on_auth_user_created vergab die Rolle aus
-- raw_user_meta_data ->> 'role'. Diese Angabe macht bei der
-- Selbstregistrierung der Browser selbst, und die Selbstregistrierung ist in
-- Supabase eingeschaltet. Mit einem direkten signUp und data.role = 'admin'
-- konnte sich so jeder ein Admin-Konto anlegen.
--
-- WAS DIESE MIGRATION TUT
--
-- Ersetzt nur den Rumpf von public.handle_new_user(). Die Rolle kommt allein
-- aus raw_app_meta_data ->> 'role', das nur der Server setzt; sonst 'kunde'.
-- Die Profilanlage bleibt unveraendert (Name aus raw_user_meta_data ist
-- harmlos). Der Trigger selbst bleibt, wie er ist. Aendert keine Daten,
-- wiederholbar.
--
-- WICHTIG ZUR REIHENFOLGE: ERST DIE FUNCTIONS, DANN DIESE MIGRATION
--
-- Supabase Auth schreibt ein mitgegebenes app_metadata erst nach dem Anlegen
-- der Zeile in auth.users. Der Trigger sieht es also nicht und vergibt
-- 'kunde'. Deshalb setzen invite-user, setup-admin und create-test-accounts
-- die Rolle seit dem 04.10.2026 selbst (_shared/startrolle.ts) und raeumen
-- die Rueckfallrolle 'kunde' wieder ab. Laeuft diese Migration VOR dem
-- Ausrollen dieser drei Functions, bekommt jede neu eingeladene Mitarbeiterin
-- und jeder neue Partner nur die Rolle 'kunde'. Also:
--   1. invite-user, setup-admin, create-test-accounts in Lovable ausrollen
--   2. danach diese Migration ausfuehren
--
-- NICHT ABGEDECKT
--
-- Wer sich selbst registriert, bekommt weiterhin 'kunde'. Ganz zu ist die
-- Tuer erst, wenn die Selbstregistrierung in den Auth-Einstellungen
-- abgeschaltet ist; alle Konten entstehen ohnehin ueber invite-user.
-- ===========================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'name', NEW.email),
    NEW.email
  );
  -- Rolle nur aus raw_app_meta_data, das setzt allein der Server.
  -- raw_user_meta_data kommt bei der Selbstregistrierung aus dem Browser.
  INSERT INTO public.user_roles (user_id, role)
  VALUES (
    NEW.id,
    COALESCE(
      (NEW.raw_app_meta_data ->> 'role')::app_role,
      'kunde'::app_role
    )
  );
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, public, authenticated;

COMMIT;

-- Nachsehen (aendert nichts): Pruefzeile 58.1 in
-- supabase/migrations-inbox/99_PRUEFUNG.sql.

-- ===========================================================================
-- Teil: 20261004130000_absicherung_lesen.sql
-- ===========================================================================

-- ===========================================================================
-- Absicherung Lesen: Kundendokumente, Hausverwaltung, Name zur Aktivierung
-- ===========================================================================
--
-- REIHENFOLGE:
--   1. Push nach main.
--   2. In Lovable ausrollen: redeem-activation-token (liefert den Vornamen
--      zur Aktivierung jetzt selbst).
--   3. Publish in Lovable.
--   4. Dann diese Migration ausfuehren.
-- Laeuft sie vor dem Ausrollen, fehlt auf der Aktivierungsseite nur der
-- Vorname in der Begruessung. Laeuft sie vor dem Publish, zeigt die alte
-- Startseite der Vertriebsleitung die Karte Hausverwaltung mit Nullen.
-- Gespeichert wird in beiden Faellen alles wie bisher.
--
-- WAS VORHER GALT (Stand der Datenbank am 04.10.2026)
--
--   Eimer `unterlagen`: „Internal read unterlagen“ liess jede interne Rolle
--   jede Datei lesen (ausser Chat), also auch Vertriebspartner fremder
--   Kunden, Marketing, HR, Objektpartner, Hausverwaltung und
--   Versicherungsexperte. Eimer `selbstauskunft-pdfs` ebenso
--   („SA-PDFs: internal or owner read“).
--   Hausverwaltung: mieter, eigentuemer, vermietungen, kautionen,
--   versicherungen, zaehlerstaende, betriebskosten und hv_tickets las jede
--   interne Rolle.
--   `lookup_activation_name(text)`: jeder ohne Anmeldung bekam zu einer
--   E-Mail-Adresse den Vornamen des Kontos, also auch die Auskunft, ob es
--   das Konto gibt.
--
-- WAS DIESE MIGRATION TUT
--
--   1. Kundendokumente lesen (`darf_unterlage_lesen`), fuer beide Eimer:
--        Admin und Inhaber: alles, auch Chat-Anhaenge wie bisher.
--        Chat-Anhaenge sonst nur ueber die eigene Teilnehmerregel.
--        Nur interne Rollen; Kunden lesen ueber ihre eigenen Regeln, die
--        bleiben unveraendert.
--        Wer jeden Kunden sieht (`darf_alle_kunden_sehen`: Vertriebsleitung,
--        Backoffice, Finanzierungspartner, Buchhaltung, Setterin,
--        individuell, Testkonto): alles. Das ist dieselbe Grenze wie bei
--        `kontakte`, und es ist auch der Rueckfall fuer Pfade, die keinem
--        Kunden zuzuordnen sind.
--        Eigener Arbeitsordner (erster Ordner = eigene Kennung): ja.
--        Sonst der zustaendige Partner des Kunden samt laufender Vertretung
--        (`is_vp_owner_of_kontakt`).
--      Der Kunde des Pfads kommt aus `unterlagen_pfad_kontakt` (unveraendert),
--      dazu drei Ordner, die sie nicht kennt: `aftersales/<kontakt>/`,
--      `mobile-scans/<token>/` (Kunde nur ueber die Scan-Sitzung mit genau
--      diesem Token; ist sie geloescht, lesen nur Admin, Inhaber und die
--      Gesamtsicht) und `externe-investments/<id>/` (jeder Kontakt, dessen
--      Portalkonto das Investment gehoert).
--      Bewusst NICHT ueber `investments.meta.docFileUrls`: Dort traegt
--      `register_unterlage_upload` jeden Pfad ein, den ein Partner angibt,
--      auch einen fremden. Am 04.10.2026 hingen 7 von 43 Scan-Dateien nur
--      dort, alle bei Kunden, deren Zustaendige ohnehin alles sehen.
--   2. Hausverwaltung lesen nur Rolle hausverwaltung, Admin, Inhaber
--      (`darf_hausverwaltung_lesen`), an acht Tabellen. `dienstleister`
--      bleibt fuer interne Rollen lesbar, die Marketingseite liest sie.
--   3. `lookup_activation_name(text)`: niemand ausser der Dienstrolle darf sie
--      aufrufen. Die Aktivierungsseite bekommt den Vornamen ueber das Token
--      (redeem-activation-token, Aktion info).
--   4. Scan-Sitzungen bleiben stehen: `cleanup_expired_tokens()` loeschte
--      `mobile_scan_sessions` zwei Tage nach Ablauf. Ohne Sitzung fehlt aber
--      die Zuordnung der Scan-Dateien zum Kunden, und der zustaendige Partner
--      verloere den Zugriff. Ein abgelaufenes Token ist trotzdem nutzlos:
--      Jede Token-Regel und jeder Token-Weg (is_mobile_scan_token_valid,
--      is_mobile_scan_token_open, get_mobile_scan_session,
--      update_mobile_scan_session, get_mobile_scan_uploaded_docs) prueft
--      `expires_at > now()`, direktes Lesen der Tabelle ist gesperrt. Die
--      DSGVO-Loeschung eines Kontakts nimmt seine Sitzungen weiter mit. Der
--      Rest der Funktion ist wortgleich zu 20260611210510, Zeitplan und
--      Rechte bleiben.
--
-- NICHT BETROFFEN
--
--   Dienstrolle (Edge Functions lesen und signieren alle Dateien mit dem
--   Dienstschluessel), SECURITY-DEFINER-Funktionen, nicht angemeldete Wege
--   (Mobil-Scan mit gueltigem Token, Unterschriftslinks), alle Schreibregeln
--   (Finanzierungspartner und Buchhaltung behalten ihre Rechte), die
--   Leseregeln der Kunden und der Chat-Teilnehmer.
--
-- WIEDERHOLBAR
--
--   CREATE OR REPLACE und DROP POLICY IF EXISTS.
--
-- ZURUECK (falls noetig, im SQL-Editor)
--
--   Die alten Regeln stehen unten in den Waechtern mit Namen, ihr Wortlaut in
--   20260517090103 und 20260930120000.
--
-- Pruefzeilen 59.1 bis 59.4 in `99_PRUEFUNG.sql`.

BEGIN;

-- Vorab: Eine unbekannte erlaubende Leseregel fuer die beiden Eimer wuerde
-- die neue Grenze aushebeln, ebenso eine Leseregel ohne Eimerbezug, die fuer
-- den ganzen Speicher gilt (etwa USING (true)). Am 04.10.2026 gab es keine
-- solche. Abbruch mit Meldung statt blind entfernen.
DO $$
DECLARE
  regel RECORD;
BEGIN
  FOR regel IN
    SELECT policyname, cmd
      FROM pg_policies
     WHERE schemaname = 'storage' AND tablename = 'objects'
       AND permissive = 'PERMISSIVE'
       AND cmd IN ('SELECT', 'ALL')
       AND (coalesce(qual, '') || coalesce(with_check, '')) ~ '''(unterlagen|selbstauskunft-pdfs)'''
       AND policyname NOT IN (
         'Chat participants read unterlagen', 'Externe Investments owner read',
         'Kunde liest eigene Reservierungsvereinbarung', 'Kunde read unterlagen',
         'Mobile scan read by valid token', 'Mobile scan read via token',
         'Person 2 liest Kundenunterlagen',
         -- fallen unten weg bzw. kommen neu
         'Internal read unterlagen', 'SA-PDFs: internal or owner read',
         'Unterlagen lesen nur zustaendig', 'SA-PDFs intern lesen nur zustaendig',
         'SA-PDFs: owner read'
       )
  LOOP
    RAISE EXCEPTION 'Unerwartete erlaubende Leseregel "%" (%) fuer unterlagen oder selbstauskunft-pdfs. Bitte ansehen und in diese Liste aufnehmen oder entfernen, dann diese Migration erneut ausfuehren.',
      regel.policyname, regel.cmd;
  END LOOP;

  FOR regel IN
    SELECT policyname, cmd
      FROM pg_policies
     WHERE schemaname = 'storage' AND tablename = 'objects'
       AND permissive = 'PERMISSIVE'
       AND cmd IN ('SELECT', 'ALL')
       AND (coalesce(qual, '') || coalesce(with_check, '')) NOT LIKE '%bucket_id%'
  LOOP
    RAISE EXCEPTION 'Erlaubende Leseregel "%" (%) auf storage.objects ohne Eimerbezug gefunden. Sie gilt fuer alle Dateien und hebelt die Grenze aus. Bitte ansehen und entfernen oder auf Eimer begrenzen, dann diese Migration erneut ausfuehren.',
      regel.policyname, regel.cmd;
  END LOOP;

  FOR regel IN
    SELECT tablename, policyname
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename IN ('mieter', 'eigentuemer', 'vermietungen', 'kautionen', 'versicherungen',
                         'zaehlerstaende', 'betriebskosten', 'hv_tickets')
       AND permissive = 'PERMISSIVE'
       AND cmd = 'ALL'
       AND (roles && ARRAY['authenticated', 'anon', 'public']::name[])
  LOOP
    RAISE EXCEPTION 'Erlaubende ALL-Regel %.% gefunden. Bitte zuerst in eine Lese- und eine Schreibregel aufteilen, dann diese Migration erneut ausfuehren.',
      regel.tablename, regel.policyname;
  END LOOP;
END $$;


-- ---------------------------------------------------------------------------
-- 1) Kundendokumente lesen
-- ---------------------------------------------------------------------------

-- Zu welchem Kontakt gehoert ein Pfad beim Lesen? Wie
-- `unterlagen_pfad_kontakt`, dazu Aftersales und Mobil-Scan. Externe
-- Investments prueft `darf_unterlage_lesen` selbst, dort koennen mehrere
-- Kontakte passen. Nur intern aufgerufen, nicht ueber die Schnittstelle.
CREATE OR REPLACE FUNCTION public.unterlagen_lese_kontakt(_name text)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  teile text[] := storage.foldername(_name);
  uuid_muster constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  treffer uuid;
BEGIN
  IF teile IS NULL OR cardinality(teile) = 0 THEN
    RETURN NULL;
  END IF;

  IF teile[1] = 'aftersales' THEN
    IF teile[2] !~* uuid_muster THEN
      RETURN NULL;
    END IF;
    SELECT k.id INTO treffer FROM public.kontakte k WHERE k.id = teile[2]::uuid;
    RETURN treffer;
  END IF;

  -- Nur die Scan-Sitzung mit genau diesem Token zaehlt. Ohne Sitzung kein
  -- Kunde, siehe Kopf.
  IF teile[1] = 'mobile-scans' THEN
    IF teile[2] IS NULL OR teile[2] = '' THEN
      RETURN NULL;
    END IF;
    SELECT s.kontakt_id INTO treffer FROM public.mobile_scan_sessions s WHERE s.token = teile[2];
    RETURN treffer;
  END IF;

  IF teile[1] = 'externe-investments' THEN
    RETURN NULL;
  END IF;

  RETURN public.unterlagen_pfad_kontakt(_name);
END;
$$;

-- Darf diese interne Person die Datei unter diesem Pfad lesen? Gilt fuer die
-- Eimer `unterlagen` und `selbstauskunft-pdfs`. Kunden haben eigene Regeln.
CREATE OR REPLACE FUNCTION public.darf_unterlage_lesen(_user_id uuid, _name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  kontakt uuid;
BEGIN
  IF _user_id IS NULL OR _name IS NULL THEN
    RETURN false;
  END IF;
  IF public.is_admin_role(_user_id) THEN
    RETURN true;
  END IF;
  -- Chat-Anhaenge: nur die Teilnehmerregel, wie bisher.
  IF (storage.foldername(_name))[1] = 'chat' THEN
    RETURN false;
  END IF;
  IF NOT public.is_internal_role(_user_id) THEN
    RETURN false;
  END IF;
  -- Wer jeden Kunden sieht, sieht auch jede Unterlage. Darin stecken
  -- Vertriebsleitung, Backoffice und Finanzierungspartner.
  IF public.darf_alle_kunden_sehen(_user_id) THEN
    RETURN true;
  END IF;
  IF (storage.foldername(_name))[1] = _user_id::text THEN
    RETURN true;
  END IF;

  -- Externe Investments: Das Portalkonto kann an mehreren Kontakten haengen
  -- (Hauptperson, Person 2). Jeder davon zaehlt.
  IF (storage.foldername(_name))[1] = 'externe-investments' THEN
    IF coalesce((storage.foldername(_name))[2], '')
       !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RETURN false;
    END IF;
    RETURN EXISTS (
      SELECT 1
        FROM public.externe_investments ei
        JOIN public.kontakte k
          ON (k.meta ->> 'authUserId') = ei.user_id::text
          OR (k.meta -> 'person2' ->> 'authUserId') = ei.user_id::text
       WHERE ei.id = ((storage.foldername(_name))[2])::uuid
         AND public.is_vp_owner_of_kontakt(_user_id, k.zustaendig_id, k.meta)
    );
  END IF;

  kontakt := public.unterlagen_lese_kontakt(_name);
  IF kontakt IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.kontakte k
     WHERE k.id = kontakt
       AND public.is_vp_owner_of_kontakt(_user_id, k.zustaendig_id, k.meta)
  );
END;
$$;

DROP POLICY IF EXISTS "Internal read unterlagen" ON storage.objects;
DROP POLICY IF EXISTS "Unterlagen lesen nur zustaendig" ON storage.objects;
CREATE POLICY "Unterlagen lesen nur zustaendig" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'unterlagen' AND public.darf_unterlage_lesen(auth.uid(), name));

-- Die alte Regel trug interne Rollen und Kunden zugleich. Der Kundenteil
-- bleibt wortgleich als eigene Regel stehen.
DROP POLICY IF EXISTS "SA-PDFs: internal or owner read" ON storage.objects;
DROP POLICY IF EXISTS "SA-PDFs intern lesen nur zustaendig" ON storage.objects;
CREATE POLICY "SA-PDFs intern lesen nur zustaendig" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'selbstauskunft-pdfs' AND public.darf_unterlage_lesen(auth.uid(), name));
DROP POLICY IF EXISTS "SA-PDFs: owner read" ON storage.objects;
CREATE POLICY "SA-PDFs: owner read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'selbstauskunft-pdfs'
    AND EXISTS (
      SELECT 1 FROM public.kontakte k
       WHERE k.id::text = (storage.foldername(objects.name))[1]
         AND ((k.meta ->> 'authUserId') = auth.uid()::text
              OR (k.meta -> 'person2' ->> 'authUserId') = auth.uid()::text)
    )
  );


-- ---------------------------------------------------------------------------
-- 2) Hausverwaltung lesen
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.darf_hausverwaltung_lesen(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    _user_id IS NOT NULL
    AND (public.is_admin_role(_user_id)
         OR public.has_role(_user_id, 'hausverwaltung'::public.app_role)),
    false)
$$;

DO $$
DECLARE
  regel RECORD;
  tabelle text;
BEGIN
  FOR regel IN
    SELECT tablename, policyname
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename IN ('mieter', 'eigentuemer', 'vermietungen', 'kautionen', 'versicherungen',
                         'zaehlerstaende', 'betriebskosten', 'hv_tickets')
       AND permissive = 'PERMISSIVE'
       AND cmd = 'SELECT'
       AND (roles && ARRAY['authenticated', 'anon', 'public']::name[])
  LOOP
    RAISE NOTICE 'Leseregel entfernt: %.%', regel.tablename, regel.policyname;
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', regel.policyname, regel.tablename);
  END LOOP;

  FOREACH tabelle IN ARRAY ARRAY['mieter', 'eigentuemer', 'vermietungen', 'kautionen', 'versicherungen',
                                 'zaehlerstaende', 'betriebskosten', 'hv_tickets'] LOOP
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated '
      'USING ((SELECT public.darf_hausverwaltung_lesen(auth.uid())))',
      'Hausverwaltung liest', tabelle);
  END LOOP;
END $$;


-- ---------------------------------------------------------------------------
-- 3) Scan-Sitzungen nicht mehr loeschen
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.cleanup_expired_tokens()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_activation int := 0;
  v_sa int := 0;
  v_unsub int := 0;
  v_sig int := 0;
BEGIN
  DELETE FROM public.activation_tokens
   WHERE (expires_at IS NOT NULL AND expires_at < now() - interval '7 days')
      OR (used_at   IS NOT NULL AND used_at   < now() - interval '30 days');
  GET DIAGNOSTICS v_activation = ROW_COUNT;

  DELETE FROM public.sa_fill_tokens
   WHERE expires_at IS NOT NULL AND expires_at < now() - interval '7 days';
  GET DIAGNOSTICS v_sa = ROW_COUNT;

  DELETE FROM public.email_unsubscribe_tokens
   WHERE used_at IS NOT NULL AND used_at < now() - interval '90 days';
  GET DIAGNOSTICS v_unsub = ROW_COUNT;

  -- mobile_scan_sessions bleiben stehen, siehe Kopf Punkt 4.

  DELETE FROM public.signature_requests
   WHERE expires_at IS NOT NULL AND expires_at < now() - interval '180 days';
  GET DIAGNOSTICS v_sig = ROW_COUNT;

  RETURN jsonb_build_object(
    'activation_tokens', v_activation,
    'sa_fill_tokens', v_sa,
    'email_unsubscribe_tokens', v_unsub,
    'mobile_scan_sessions', 0,
    'signature_requests', v_sig,
    'ran_at', now()
  );
END;
$$;


-- ---------------------------------------------------------------------------
-- 4) Rechte
-- ---------------------------------------------------------------------------

-- Nur aus `darf_unterlage_lesen` heraus (laeuft als Eigentuemer), nicht
-- ueber die Schnittstelle: Sonst liesse sich zu jedem Pfad der Kunde abfragen.
REVOKE ALL ON FUNCTION public.unterlagen_lese_kontakt(text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.darf_unterlage_lesen(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.darf_unterlage_lesen(uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.darf_hausverwaltung_lesen(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.darf_hausverwaltung_lesen(uuid) TO authenticated;

-- Kein Aufrufer mehr im Browser. Die Dienstrolle behaelt das Recht.
REVOKE ALL ON FUNCTION public.lookup_activation_name(text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lookup_activation_name(text) TO service_role;

COMMIT;

-- ===========================================================================
-- Teil: 20261004150000_einreichung_upload_server.sql
-- ===========================================================================

-- ===========================================================================
-- Bilder der Objekteinreichung nur noch ueber die Function, Groessengrenze
-- am Eimer objekt-medien
-- ===========================================================================
--
-- WARUM
--
-- 20260831180000_objektakquise_offener_link.sql hat zwei Speicherregeln
-- angelegt: anon durfte selbst nach objekt-medien/einreichungen/public/
-- hochladen, jeder Angemeldete (auch Kunde, Tippgeber, Bewerber) in
-- einreichungen/<eigene Kennung>/. Der Eimer ist oeffentlich, beide Regeln
-- kannten weder Dateityp noch Groesse noch eine Bremse: Jeder konnte
-- beliebige Dateien unter unserer Adresse ablegen und verteilen.
--
-- Seit dem 04.10.2026 laedt das Formular unter /objekt-akquise in beiden
-- Faellen ueber die Function submit-objekt-einreichung hoch. Sie nimmt nur
-- Bilder bis 15 MB an, erkannt am Dateianfang, mit Kontingent je Anschluss,
-- und legt mit der Dienstrolle in denselben Ordnern ab wie bisher.
--
-- WAS DIESE MIGRATION TUT
--
-- 1. Entfernt beide Einreichungsregeln. Die Regeln fuer Admin, Inhaber,
--    Objektpartner und Objektfotos (20260930120000) bleiben unberuehrt.
-- 2. Setzt am Eimer objekt-medien eine Groessengrenze von 30 MB je Datei.
--    Gezaehlt am 04.10.2026: die groesste Datei hat 5,5 MB (ein Exposé),
--    Unterlagen sind im Formular auf 25 MB begrenzt (ObjektNeu.tsx). 30 MB
--    liegt ueber jedem heutigen Weg.
--
-- Bewusst KEINE Typgrenze (allowed_mime_types) am Eimer: Hinein gehoeren
-- auch PDFs (Exposés, Wohnungsexposés, Unterlagen unter objekte/) und aus
-- Investagon kommen Bilder als application/octet-stream. Eine Typliste
-- wuerde heutige Wege brechen. Die Typpruefung fuer Fremde macht die
-- Function.
--
-- Aendert keine Daten, wiederholbar.
--
-- REIHENFOLGE
--
--   1. submit-objekt-einreichung in Lovable ausrollen
--   2. Publish (die Seite nutzt dann den neuen Weg)
--   3. erst dann diese Migration
--
-- Laeuft sie vorher, scheitert der Bild-Upload auf /objekt-akquise. Das
-- Formular sagt das und laesst sich trotzdem absenden.
-- ===========================================================================

DROP POLICY IF EXISTS objekt_medien_anon_einreichung_upload ON storage.objects;
DROP POLICY IF EXISTS objekt_medien_auth_einreichung_upload ON storage.objects;

UPDATE storage.buckets SET file_size_limit = 31457280 WHERE id = 'objekt-medien';

-- Nachsehen (aendert nichts): Pruefzeile 59.1 und 59.2 in
-- supabase/migrations-inbox/99_PRUEFUNG.sql.

-- ===========================================================================
-- Teil: 20261004152000_kundenportal_sperre_nachziehen.sql
-- ===========================================================================

-- ===========================================================================
-- Kundenportal-Sperre nachziehen (zu 20260923180000_kundenportal_sperre)
-- ===========================================================================
--
-- LIVE GEPRUEFT AM 04.10.2026 (lesend)
--
--   1. 14 Tabellen, die nach dem 23.09.2026 dazukamen, tragen die Sperrregel
--      „Kundenportal-Sperre“ noch nicht (117 von 131), darunter
--      lead_pakete, lead_paket_zuweisungen, lotse_nachrichten,
--      handbuch_anforderungen und bewerbungen. Ein gesperrter Kunde kaeme
--      dort an das heran, was ihm die anderen Regeln geben.
--   2. Live laeuft eine abweichende Fassung von
--      `kundenportal_sperrregeln_anlegen`: Die 117 Regeln fragen
--      `kunde_portal_gesperrt(auth.uid())` direkt statt
--      `kundenportal_gesperrt_fuer_mich()`. Damit das geht, ist
--      `kunde_portal_gesperrt(uuid)` fuer `authenticated` ausfuehrbar, und
--      jeder Angemeldete kann fuer eine fremde Kennung erfragen, ob sie ein
--      gesperrter Kunde ist.
--
-- GRUNDLAGE
--
--   Teil e) baut merge_kontakt_meta auf der Fassung aus
--   20260928160000_glocke_absichern und merge_investment_meta auf der aus
--   20260930110000_absicherung_geld_vertraege auf, jeweils nur um die
--   Sperrpruefung am Anfang ergaenzt.
--
-- WAS DIESE MIGRATION TUT, IN DIESER REIHENFOLGE
--
--   a) Stellt `kundenportal_sperrregeln_anlegen` auf die Fassung im Repo
--      zurueck (Regel fragt `kundenportal_gesperrt_fuer_mich()`).
--   b) Laesst sie laufen: alle Regeln neu, auch an den 14 neueren Tabellen.
--   c) Waechter: Fragt danach noch irgendeine Regel, Sicht oder Funktion
--      ohne SECURITY DEFINER `kunde_portal_gesperrt(` direkt, bricht alles
--      ab und nichts ist geaendert. Sonst wuerde (d) diese Regeln fuer alle
--      Angemeldeten scheitern lassen.
--   d) Nimmt `authenticated` das Recht an `kunde_portal_gesperrt(uuid)`.
--   e) Gesperrte Kunden auch in den Datenbankfunktionen (Pruefung Codex,
--      04.10.2026). SECURITY DEFINER umgeht die Sperrregel an den Tabellen,
--      deshalb fragen jetzt selbst:
--        - merge_kontakt_meta und merge_investment_meta (Fehler statt
--          Rueckgabe),
--        - darf_investment_nutzen und ist_kunde_des_kontakts im Kundenzweig.
--          Darauf stuetzen sich confirm_notar_termin,
--          register_unterlage_upload, unregister_unterlage_upload,
--          einheit_belegung_abgleichen und die Regeln, die sie nutzen.
--      Restrisiko, weil sie authUserId selbst vergleichen und nicht ueber
--      diese Helfer gehen: kundenchat_starten, chat_teilnehmer_eintragen,
--      create_empfehlung_kontakt, eigenfinanzierung_kunde_unterlage,
--      get_kunde_vp_profile.
--   f) Eine Sperre trifft nur Konten, die ausschliesslich die Rolle kunde
--      tragen. Wer zusaetzlich Tippgeber oder intern ist, wird nicht aus der
--      Datenbank ausgesperrt; fuer ihn sperrt nur die Portalseite ueber den
--      Anzeigewert. Gilt auch fuer Person 2.
--
--   Aendert keine Daten, keine Function auszurollen, Reihenfolge egal,
--   wiederholbar.
--
-- OHNE SIE
--
--   Die Sperre wirkt weiter auf Anmeldung und auf die 117 Tabellen, nur die
--   14 neueren bleiben fuer gesperrte Kunden offen. Es stuerzt nichts ab.
-- ===========================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.kundenportal_sperrregeln_anlegen()
RETURNS integer
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  _t record;
  _anzahl integer := 0;
  _ausgelassen text[] := ARRAY[]::text[];
BEGIN
  FOR _t IN
    SELECT n.nspname::text AS schema_name, c.relname::text AS tabelle
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relkind IN ('r', 'p')
       AND c.relrowsecurity
       AND c.relname NOT IN ('profiles', 'user_roles', 'user_settings')
    UNION ALL
    SELECT 'storage', 'objects'
  LOOP
    BEGIN
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I',
        'Kundenportal-Sperre', _t.schema_name, _t.tabelle);
      EXECUTE format(
        'CREATE POLICY %I ON %I.%I AS RESTRICTIVE FOR ALL TO authenticated '
        || 'USING (NOT (SELECT public.kundenportal_gesperrt_fuer_mich())) '
        || 'WITH CHECK (NOT (SELECT public.kundenportal_gesperrt_fuer_mich()))',
        'Kundenportal-Sperre', _t.schema_name, _t.tabelle);
      _anzahl := _anzahl + 1;
    EXCEPTION WHEN insufficient_privilege OR undefined_table THEN
      _ausgelassen := _ausgelassen || (_t.schema_name || '.' || _t.tabelle);
    END;
  END LOOP;

  RAISE NOTICE 'Kundenportal-Sperre an % Tabellen gesetzt', _anzahl;
  IF array_length(_ausgelassen, 1) > 0 THEN
    RAISE WARNING 'Kundenportal-Sperre nicht gesetzt (keine Rechte): %',
      array_to_string(_ausgelassen, ', ');
  END IF;
  RETURN _anzahl;
END;
$$;

REVOKE ALL ON FUNCTION public.kundenportal_sperrregeln_anlegen() FROM public, anon, authenticated, service_role;

SELECT public.kundenportal_sperrregeln_anlegen();

DO $$
DECLARE
  _rest text;
BEGIN
  SELECT string_agg(wo, ', ') INTO _rest FROM (
    SELECT schemaname || '.' || tablename || ' ' || policyname AS wo
      FROM pg_policies
     WHERE (COALESCE(qual, '') || COALESCE(with_check, '')) LIKE '%kunde_portal_gesperrt(%'
    UNION ALL
    SELECT 'Sicht ' || schemaname || '.' || viewname
      FROM pg_views
     WHERE definition LIKE '%kunde_portal_gesperrt(%'
    UNION ALL
    SELECT 'Funktion ' || p.proname
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND NOT p.prosecdef
       AND p.prosrc LIKE '%kunde_portal_gesperrt(%'
  ) x;
  IF _rest IS NOT NULL THEN
    RAISE EXCEPTION 'Abbruch, nichts geaendert: kunde_portal_gesperrt wird noch direkt gefragt von %', _rest;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.kunde_portal_gesperrt(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kunde_portal_gesperrt(uuid) TO service_role;

-- f) Nur Konten mit ausschliesslich der Rolle kunde.
CREATE OR REPLACE FUNCTION public.kunde_portal_gesperrt(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    _user_id IS NOT NULL
    AND EXISTS (
      SELECT 1
        FROM public.kundenportal_sperren s
        JOIN public.kontakte k ON k.id = s.kontakt_id
       WHERE s.gesperrt
         AND (   (k.meta ->> 'authUserId') = _user_id::text
              OR ((k.meta -> 'person2') ->> 'authUserId') = _user_id::text)
    )
    AND NOT public.is_internal_role(_user_id)
    AND NOT EXISTS (
      SELECT 1 FROM public.user_roles ur
       WHERE ur.user_id = _user_id AND ur.role::text <> 'kunde'
    ),
    false)
$$;

-- e) Kundenzweig der beiden Helfer.
CREATE OR REPLACE FUNCTION public.darf_investment_nutzen(_user_id uuid, _kunde_id uuid, _kontakt_meta jsonb)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _user_id IS NULL
      OR COALESCE(
           public.darf_alle_kunden_sehen(_user_id)
           OR public.ist_eigenes_investment(_user_id, _kunde_id)
           OR (
             (   (_kontakt_meta ->> 'authUserId') = _user_id::text
              OR ((_kontakt_meta -> 'person2') ->> 'authUserId') = _user_id::text)
             AND NOT public.kunde_portal_gesperrt(_user_id)
           ),
           false)
$$;

CREATE OR REPLACE FUNCTION public.ist_kunde_des_kontakts(_user_id uuid, _kontakt_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT (k.meta ->> 'authUserId') = _user_id::text
          OR ((k.meta -> 'person2') ->> 'authUserId') = _user_id::text
        FROM public.kontakte k
       WHERE k.id = _kontakt_id
       LIMIT 1
    ),
    false)
    AND NOT public.kunde_portal_gesperrt(_user_id)
$$;

-- e) Die beiden Zusammenfuehr-Funktionen, bisherige Fassung plus
--    Sperrpruefung am Anfang.
CREATE OR REPLACE FUNCTION public.merge_kontakt_meta(_kontakt_id uuid, _updates jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Schluessel, die ein Kunde an seinem eigenen Kontakt setzen darf
  _erlaubte_schluessel text[] := ARRAY[
    'steuersatzManuell',
    'deletionRequestedAt',
    'deletionRequestedBy',
    'portalErstLogin',
    'portalAktiv',
    'portalFreigeschalten',
    'portalAktivAt'
  ];
  _kontakt_meta jsonb;
  _zustaendig uuid;
  _ist_intern boolean;
  _wirksam jsonb;
  _schluessel text;
  _verworfen text[] := ARRAY[]::text[];
  _result jsonb;
BEGIN
  -- Gesperrter Kunde: keine Rueckgabe, kein Schreiben (04.10.2026).
  IF auth.uid() IS NOT NULL AND public.kunde_portal_gesperrt(auth.uid()) THEN
    RAISE EXCEPTION 'Dein Zugang ist gerade gesperrt.' USING ERRCODE = '42501';
  END IF;
  SELECT meta, zustaendig_id INTO _kontakt_meta, _zustaendig FROM public.kontakte WHERE id = _kontakt_id;
  IF NOT FOUND THEN
    -- Neutrale Meldung: keine Auskunft darueber, ob die UUID existiert
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- auth.uid() IS NULL = Service-Role (Edge Functions), anon hat kein EXECUTE
  _ist_intern := auth.uid() IS NULL OR public.is_internal_role(auth.uid());

  -- Neu am 28.09.2026: Interne Rollen ohne Blick auf alle Kunden nur am
  -- Kontakt, den sie betreuen (wie die Bearbeiten-Regel auf kontakte).
  IF auth.uid() IS NOT NULL AND COALESCE(_ist_intern, false)
     AND NOT COALESCE(public.darf_alle_kunden_sehen(auth.uid()), false)
     AND NOT COALESCE(public.is_vp_owner_of_kontakt(auth.uid(), _zustaendig, _kontakt_meta), false) THEN
    _ist_intern := false;
  END IF;

  -- Geaendert am 16.09.2026 (Audit F01): Jeder Vergleich einzeln in COALESCE,
  -- sonst wird aus einem fehlenden Schluessel ein unbekannt und die Sperre
  -- wird stillschweigend uebersprungen.
  IF NOT (
    COALESCE(_ist_intern, false)
    OR COALESCE((_kontakt_meta ->> 'authUserId') = auth.uid()::text, false)
    OR COALESCE(((_kontakt_meta -> 'person2') ->> 'authUserId') = auth.uid()::text, false)
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  _wirksam := COALESCE(_updates, '{}'::jsonb);

  IF NOT _ist_intern THEN
    _wirksam := '{}'::jsonb;
    FOR _schluessel IN SELECT jsonb_object_keys(COALESCE(_updates, '{}'::jsonb)) LOOP
      IF _schluessel = ANY(_erlaubte_schluessel) THEN
        _wirksam := _wirksam || jsonb_build_object(_schluessel, _updates -> _schluessel);
      ELSE
        _verworfen := _verworfen || _schluessel;
      END IF;
    END LOOP;

    IF array_length(_verworfen, 1) > 0 THEN
      RAISE LOG 'merge_kontakt_meta: nicht erlaubte Schluessel verworfen (%)',
        array_to_string(_verworfen, ', ');
    END IF;
  END IF;

  -- Nichts Erlaubtes uebrig: unveraenderten Stand zurueckgeben, nicht schreiben
  IF _wirksam = '{}'::jsonb THEN
    RETURN COALESCE(_kontakt_meta, '{}'::jsonb);
  END IF;

  UPDATE kontakte
  SET meta = public.jsonb_deep_merge(COALESCE(meta, '{}'::jsonb), _wirksam),
      aktualisiert_am = now()
  WHERE id = _kontakt_id
  RETURNING meta INTO _result;

  RETURN COALESCE(_result, '{}'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.merge_investment_meta(_investment_id uuid, _updates jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _erlaubte_schluessel text[] := ARRAY[
    'marktwertHistorie',
    'steuerCockpit'
  ];
  _result jsonb;
  _kunde_id uuid;
  _kontakt_meta jsonb;
  _inv_meta jsonb;
  _ist_intern boolean;
  _wirksam jsonb;
  _schluessel text;
  _verworfen text[] := ARRAY[]::text[];
BEGIN
  -- Gesperrter Kunde: keine Rueckgabe, kein Schreiben (04.10.2026).
  IF auth.uid() IS NOT NULL AND public.kunde_portal_gesperrt(auth.uid()) THEN
    RAISE EXCEPTION 'Dein Zugang ist gerade gesperrt.' USING ERRCODE = '42501';
  END IF;
  SELECT kunde_id, meta INTO _kunde_id, _inv_meta
  FROM public.investments WHERE id = _investment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Investment not found';
  END IF;

  SELECT meta INTO _kontakt_meta FROM public.kontakte WHERE id = _kunde_id;

  _ist_intern := auth.uid() IS NULL OR public.is_internal_role(auth.uid());

  IF NOT public.darf_investment_nutzen(auth.uid(), _kunde_id, _kontakt_meta) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  _wirksam := COALESCE(_updates, '{}'::jsonb);

  IF NOT _ist_intern THEN
    _wirksam := '{}'::jsonb;
    FOR _schluessel IN SELECT jsonb_object_keys(COALESCE(_updates, '{}'::jsonb)) LOOP
      IF _schluessel = ANY(_erlaubte_schluessel) THEN
        _wirksam := _wirksam || jsonb_build_object(_schluessel, _updates -> _schluessel);
      ELSE
        _verworfen := _verworfen || _schluessel;
      END IF;
    END LOOP;
  END IF;

  -- Geschuetzte Schluessel (20260930110000): Mitarbeiter ohne Admin-Rolle
  -- setzen sie nie. Zuruecksetzen (leerer Wert) duerfen sie nur die, die die
  -- Oberflaeche heute leert: Selbstauskunft neu unterschreiben lassen
  -- (SelbstauskunftForm), Reservierung zuruecksetzen (clearRvSignatureData,
  -- setInvestmentRvPdf("")) und Notartermin neu freigeben. Alle anderen,
  -- etwa rvReservierungAb, blieben sonst leerbar, und eine Reservierung
  -- gaelte sofort als wirksam.
  IF _ist_intern AND auth.uid() IS NOT NULL AND NOT public.is_admin_role(auth.uid())
     AND jsonb_typeof(_wirksam) = 'object' THEN
    FOR _schluessel IN SELECT jsonb_object_keys(_wirksam) LOOP
      IF _schluessel = ANY(public.investment_geschuetzte_schluessel())
         AND NOT (
           _schluessel = ANY(ARRAY[
             'saSigned', 'saSignedAt', 'saSignatures',
             'rvPdf', 'rvData', 'rvSignatures', 'rvSigned',
             'notarTerminBestaetigt'
           ]::text[])
           AND public.investment_wert_leer(_wirksam -> _schluessel)
         ) THEN
        _wirksam := _wirksam - _schluessel;
        _verworfen := _verworfen || _schluessel;
      END IF;
    END LOOP;
  END IF;

  IF array_length(_verworfen, 1) > 0 THEN
    RAISE LOG 'merge_investment_meta: nicht erlaubte Schluessel verworfen (%)',
      array_to_string(_verworfen, ', ');
  END IF;

  IF _wirksam = '{}'::jsonb THEN
    RETURN COALESCE(_inv_meta, '{}'::jsonb);
  END IF;

  UPDATE public.investments
  SET meta = COALESCE(meta, '{}'::jsonb) || _wirksam
  WHERE id = _investment_id
  RETURNING meta INTO _result;

  RETURN COALESCE(_result, '{}'::jsonb);
END;
$$;

COMMIT;

-- ===========================================================================
-- Teil: 20261004160000_eigentuemer_aus_investment.sql
-- ===========================================================================

-- ===========================================================================
-- Eigentuemer aus dem Investment anlegen, geprueft auf dem Server
-- ===========================================================================
--
-- WARUM
--
--   Nach dem Notartermin uebernimmt das Kundenprofil den Kaeufer als
--   Eigentuemer in die Hausverwaltung. Der Browser schrieb dazu direkt in
--   `eigentuemer`. Seit 20260930120000 duerfen dort nur Hausverwaltung,
--   Admin und Inhaber anlegen. Fuer Partner und Backoffice scheiterte die
--   Uebernahme still, die Stufe sprang trotzdem auf „faelligkeit“, und ein
--   zweiter Versuch kam nie.
--
-- WAS DIESE MIGRATION TUT
--
--   Neue Funktion `eigentuemer_aus_investment(uuid)`, SECURITY DEFINER:
--     - nur angemeldete interne Rollen, die das Investment nutzen duerfen
--       (`darf_investment_nutzen`, dieselbe Regel wie confirm_notar_termin),
--     - nur mit eingetragenem Notartermin,
--     - je Investment genau einmal: Gibt es schon einen Eigentuemer mit
--       `meta.herkunftInvestmentId`, kommt dessen Kennung zurueck. Eine
--       Sperre je Investment verhindert, dass zwei Klicks zugleich anlegen.
--       Einen eindeutigen Index gibt es bewusst nicht: Live liegen am
--       04.10.2026 drei doppelte Altfaelle, die erst jemand zusammenfuehren
--       muss.
--     - Name, Kontaktdaten und Adresse kommen aus dem Kontakt in der
--       Datenbank, nicht aus dem Browser.
--   Rueckgabe: die Kennung des Eigentuemers.
--
--   Aendert keine Daten, keine Function auszurollen, wiederholbar.
--
-- OHNE SIE
--
--   Der Browser nimmt den alten Weg (direktes Anlegen). Das klappt fuer
--   Admin, Inhaber und Hausverwaltung; fuer alle anderen bleibt die Stufe
--   jetzt auf „notar“ stehen und das Kundenprofil bietet einen neuen Versuch
--   an, statt still weiterzuschalten.
-- ===========================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.eigentuemer_aus_investment(_investment_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _inv public.investments%ROWTYPE;
  _k public.kontakte%ROWTYPE;
  _inv_meta jsonb;
  _notar text;
  _vorhanden uuid;
  _name text;
  _strasse text;
  _objekt_id text;
  _objekt_name text;
  _neu uuid;
BEGIN
  IF _uid IS NULL OR NOT public.is_internal_role(_uid) THEN
    RAISE EXCEPTION 'Keine Berechtigung' USING ERRCODE = '42501';
  END IF;
  IF _investment_id IS NULL THEN
    RAISE EXCEPTION 'Investment fehlt';
  END IF;

  SELECT * INTO _inv FROM public.investments WHERE id = _investment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Investment nicht gefunden';
  END IF;
  SELECT * INTO _k FROM public.kontakte WHERE id = _inv.kunde_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kontakt nicht gefunden';
  END IF;
  IF NOT public.darf_investment_nutzen(_uid, _inv.kunde_id, _k.meta) THEN
    RAISE EXCEPTION 'Keine Berechtigung' USING ERRCODE = '42501';
  END IF;

  _inv_meta := CASE WHEN jsonb_typeof(_inv.meta) = 'object' THEN _inv.meta ELSE '{}'::jsonb END;
  _notar := COALESCE(NULLIF(_inv_meta -> 'notarData' ->> 'datum', ''), NULLIF(_inv_meta ->> 'notarTermin', ''));
  IF _notar IS NULL THEN
    RAISE EXCEPTION 'Für dieses Investment ist noch kein Notartermin eingetragen';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('eigentuemer_aus_investment:' || _investment_id::text, 0));

  SELECT id INTO _vorhanden
    FROM public.eigentuemer
   WHERE meta ->> 'herkunftInvestmentId' = _investment_id::text
   ORDER BY erstellt_am NULLS LAST, id
   LIMIT 1;
  IF _vorhanden IS NOT NULL THEN
    RETURN _vorhanden;
  END IF;

  _name := NULLIF(trim(concat_ws(' ', NULLIF(trim(_k.vorname), ''), NULLIF(trim(_k.nachname), ''))), '');
  _name := COALESCE(_name, NULLIF(trim(_k.firma), ''), 'Unbekannt');
  _strasse := NULLIF(trim(concat_ws(' ', NULLIF(trim(_k.strasse), ''), NULLIF(trim(_k.hausnummer), ''))), '');
  _objekt_id := NULLIF(_inv_meta ->> 'objektId', '');
  _objekt_name := COALESCE(NULLIF(_inv_meta ->> 'objektTitel', ''), NULLIF(_inv.objekt, ''), NULLIF(_inv_meta ->> 'label', ''));

  INSERT INTO public.eigentuemer (name, email, telefon, adresse, objekte, notizen, meta)
  VALUES (
    _name,
    COALESCE(_k.email, ''),
    COALESCE(_k.telefon, ''),
    NULLIF(concat_ws(', ', _strasse, NULLIF(trim(_k.plz), ''), NULLIF(trim(_k.ort), '')), ''),
    CASE WHEN _objekt_id IS NULL THEN '{}'::text[] ELSE ARRAY[_objekt_id] END,
    'Automatisch übernommen aus Vertrieb (Notar: ' || _notar || ')',
    jsonb_build_object(
      'typ', 'privatperson',
      'anrede', COALESCE(_k.anrede, ''),
      'strasse', COALESCE(_strasse, ''),
      'plz', COALESCE(_k.plz, ''),
      'ort', COALESCE(_k.ort, ''),
      'steuernummer', '',
      'bankIban', '',
      'bankBic', '',
      'verwaltervertragBeginn', '',
      'verwaltervertragEnde', '',
      'verwalterhonorar', 0,
      'kuendigungsfrist', '3 Monate',
      'objektNamen', CASE WHEN _objekt_name IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(_objekt_name) END,
      'wirtschaftsplanJahr', extract(year FROM now())::int,
      'wirtschaftsplanBetrag', 0,
      'instandhaltungsruecklage', 0,
      'ruecklageSollMonatlich', 0,
      'herkunftVertrieb', true,
      'herkunftKontaktId', _k.id::text,
      'herkunftInvestmentId', _investment_id::text,
      'herkunftKontaktName', _name,
      'herkunftNotarDatum', _notar,
      'herkunftUebernommenVon', _uid::text
    )
  )
  RETURNING id INTO _neu;

  RETURN _neu;
END;
$$;

REVOKE ALL ON FUNCTION public.eigentuemer_aus_investment(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.eigentuemer_aus_investment(uuid) TO authenticated;

COMMIT;

-- ===========================================================================
-- Teil: 20261004170000_abrechnung_bescheid_sperre.sql
-- ===========================================================================

-- ===========================================================================
-- Provisionsbescheide ab Freigabe gesperrt
-- ===========================================================================
--
-- Entscheidung vom 04.10.2026: „Abrechnungen neu berechnen“ auf
-- /provisionsabrechnung aendert einen Bescheid nur, solange er „offen“ ist.
-- Ein freigegebener oder ausgezahlter Bescheid ist ein Beleg. Bisher
-- ueberschrieb ein Neuberechnen seine Posten und Summen, nur der Status
-- blieb stehen; ausgezahlt war danach ein anderer Betrag als ueberwiesen.
--
-- Die Oberflaeche ueberspringt solche Bescheide seit dem 04.10.2026 selbst
-- (`bescheidVeraenderbar` in src/lib/provisionsAbrechnungStore.ts). Dieser
-- Ausloeser haelt es zusaetzlich in der Datenbank fest, auch fuer einen
-- veralteten Tab oder einen direkten Aufruf.
--
-- Was gesperrt ist: Monat, Partner, Posten und alle Summen. Was frei bleibt:
-- der Status selbst (auch zurueck auf „offen“, danach ist der Bescheid
-- wieder veraenderbar), Freigabe- und Auszahlungsvermerke, PDF-Vermerk,
-- Beleg. Geprueft wird der ALTE Status: Wer in einem Schritt den Status
-- zuruecksetzt und neue Zahlen schreibt, wird abgelehnt.
--
-- Zweiter Ausloeser: Kein Investment in zwei Monaten. Wird ein Bescheid
-- freigegeben oder ausgezahlt (oder so angelegt), darf keine seiner
-- Investment-Kennungen schon in einem anderen freigegebenen oder
-- ausgezahlten Bescheid desselben Partners stehen. Eine Sperre je Partner
-- verhindert, dass zwei gleichzeitige Freigaben beide durchkommen. Posten
-- aelterer Bescheide ohne Investment-Kennung prueft er nicht; die zeigt die
-- Oberflaeche als „Bitte klaeren“.
--
-- Dritter Ausloeser: Ein Bescheid mit Status ungleich „offen“ laesst sich
-- aus dem Browser nicht loeschen (Rolle im Anmeldetoken `authenticated` oder
-- `anon`, wie bei `loeschen_aus_dem_browser` aus 20261004193000; hier
-- eigenstaendig, damit die Reihenfolge egal bleibt). Dienstrolle und
-- SQL-Editor bleiben frei.
--
-- Steht fuer sich, Reihenfolge egal, keine Function auszurollen, aendert
-- keine Daten, wiederholbar. Ohne sie sperrt nur die Oberflaeche.
-- ===========================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.provisionsabrechnung_bescheid_sperre()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.status <> 'offen' AND (
       NEW.monat IS DISTINCT FROM OLD.monat
    OR NEW.user_id IS DISTINCT FROM OLD.user_id
    OR NEW.eigene_deals IS DISTINCT FROM OLD.eigene_deals
    OR NEW.overrides_erhalten IS DISTINCT FROM OLD.overrides_erhalten
    OR NEW.overheads_abgezogen IS DISTINCT FROM OLD.overheads_abgezogen
    OR NEW.summe_eigen IS DISTINCT FROM OLD.summe_eigen
    OR NEW.summe_overrides_erhalten IS DISTINCT FROM OLD.summe_overrides_erhalten
    OR NEW.summe_overhead IS DISTINCT FROM OLD.summe_overhead
    OR NEW.netto IS DISTINCT FROM OLD.netto
  ) THEN
    RAISE EXCEPTION 'Bescheid ist gesperrt (Status %), die Zahlen bleiben unveraendert.', OLD.status
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.provisionsabrechnung_bescheid_sperre() FROM anon, public, authenticated;

DROP TRIGGER IF EXISTS trg_provisionsabrechnung_bescheid_sperre ON public.provisionsabrechnungen;
CREATE TRIGGER trg_provisionsabrechnung_bescheid_sperre
  BEFORE UPDATE ON public.provisionsabrechnungen
  FOR EACH ROW EXECUTE FUNCTION public.provisionsabrechnung_bescheid_sperre();

CREATE OR REPLACE FUNCTION public.provisionsabrechnung_keine_doppelung()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  _monate text;
BEGIN
  IF NEW.status NOT IN ('freigegeben', 'ausgezahlt') THEN
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('provisionsabrechnung:' || NEW.user_id::text));
  SELECT string_agg(DISTINCT p.monat, ', ') INTO _monate
    FROM public.provisionsabrechnungen p
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(p.eigene_deals) = 'array' THEN p.eigene_deals ELSE '[]'::jsonb END
    ) AS alt(posten)
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(NEW.eigene_deals) = 'array' THEN NEW.eigene_deals ELSE '[]'::jsonb END
    ) AS neu(posten)
   WHERE p.user_id = NEW.user_id
     AND p.id <> NEW.id
     AND p.status IN ('freigegeben', 'ausgezahlt')
     AND nullif(alt.posten ->> 'investmentId', '') IS NOT NULL
     AND alt.posten ->> 'investmentId' = neu.posten ->> 'investmentId';
  IF _monate IS NOT NULL THEN
    RAISE EXCEPTION 'Abschluss doppelt abgerechnet: steht schon im Bescheid %', _monate
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.provisionsabrechnung_keine_doppelung() FROM anon, public, authenticated;

DROP TRIGGER IF EXISTS trg_provisionsabrechnung_keine_doppelung ON public.provisionsabrechnungen;
CREATE TRIGGER trg_provisionsabrechnung_keine_doppelung
  BEFORE INSERT OR UPDATE ON public.provisionsabrechnungen
  FOR EACH ROW EXECUTE FUNCTION public.provisionsabrechnung_keine_doppelung();

CREATE OR REPLACE FUNCTION public.provisionsabrechnung_loeschen_pruefen()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.status <> 'offen'
     AND coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '')
         IN ('authenticated', 'anon') THEN
    RAISE EXCEPTION 'Bescheid ist gesperrt (Status %), er bleibt als Beleg erhalten.', OLD.status
      USING ERRCODE = 'P0001';
  END IF;
  RETURN OLD;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.provisionsabrechnung_loeschen_pruefen() FROM anon, public, authenticated;

DROP TRIGGER IF EXISTS trg_provisionsabrechnung_loeschen_pruefen ON public.provisionsabrechnungen;
CREATE TRIGGER trg_provisionsabrechnung_loeschen_pruefen
  BEFORE DELETE ON public.provisionsabrechnungen
  FOR EACH ROW EXECUTE FUNCTION public.provisionsabrechnung_loeschen_pruefen();

COMMIT;

-- Nachsehen (aendert nichts): Pruefzeilen 75.1 bis 75.3 in
-- supabase/migrations-inbox/99_PRUEFUNG.sql.

-- ===========================================================================
-- Teil: 20261004171000_buchhaltung_kundenprofil_pipeline.sql
-- ===========================================================================

-- ===========================================================================
-- Buchhaltung: Kundenprofil und Pipeline freigeben
-- ===========================================================================
--
-- WARUM
--
--   Backoffice und Buchhaltung setzen die Stufen „Abrechnung“ und
--   „Abgeschlossen“ (Datenbank seit 20261001120000,
--   `pipeline_abschluss_schuetzen`). Die Buchhaltung kam aber weder ins
--   Kundenprofil noch in die Pipeline: In `role_permissions` fehlen
--   /kunden und /pipeline (live gesehen am 04.10.2026). Lesen darf sie die
--   Kontakte schon (`darf_alle_kunden_sehen`).
--
-- WAS DIESE MIGRATION TUT
--
--   Zwei Zeilen in `role_permissions`. Aendert keine anderen Daten, keine
--   Function auszurollen, Reihenfolge egal, wiederholbar.
--
-- OHNE SIE
--
--   Die Oberflaeche hat dieselben Eintraege als Rueckfall, massgeblich ist
--   aber die Tabelle: Die Buchhaltung sieht die beiden Punkte weiter nicht.
-- ===========================================================================

INSERT INTO public.role_permissions (role, url) VALUES
  ('buchhaltung', '/kunden'),
  ('buchhaltung', '/pipeline')
ON CONFLICT DO NOTHING;

-- ===========================================================================
-- Teil: 20261004175000_empfehlungsprogramm_anfrage.sql
-- ===========================================================================

-- ===========================================================================
-- Kundenportal: Empfehlungsprogramm anfragen
-- ===========================================================================
--
-- GL-Vorgabe vom 04.10.2026: Fragt ein Kunde im Portal das
-- Empfehlungsprogramm an, bekommt der zustaendige Partner eine Aufgabe und
-- eine Glocke, die auf diese Aufgabe zeigt. Ohne Zustaendigen gehen beide an
-- Admin, Inhaber und Vertriebsleitung (Glockenregel vom 29.09.2026), jede
-- Person einmal. Zustaendig ist allein kontakte.zustaendig_id, nie der
-- Beratername; die Setter-Rolle ruht und spielt keine Rolle.
--
-- Warum eine Funktion: Ein Kunde darf weder eine Aufgabe fuer einen anderen
-- anlegen noch der Leitung eine Glocke schicken (darf_glocke_senden,
-- 20260928160000). Ohne diese Migration schickt die Seite nur eine Glocke
-- an den Zustaendigen (mit Link aufs Kundenprofil, ohne Aufgabe); ohne
-- Zustaendigen sieht der Kunde eine Fehlermeldung.
--
-- Die Aufgabe gehoert dem Empfaenger (benutzer_id und zugewiesen_an), nicht
-- dem Kunden. So sieht der Kunde sie nicht und kann sie auch nicht erledigen;
-- das Portal braucht sie nicht. Erkannt wird sie am festen Marker in
-- ausloeser_schluessel ("empfehlungsprogramm:<Kontakt>:<Zeitpunkt>"), nicht
-- am Titel. Liegt fuer den Kontakt schon eine offene Anfrage vor, entsteht
-- keine zweite und keine neue Glocke. Eine Sperre je Kontakt
-- (pg_advisory_xact_lock) verhindert, dass zwei gleichzeitige Klicks beide
-- durch die Pruefung kommen.
--
-- Steht fuer sich, Reihenfolge egal, keine Function auszurollen, aendert
-- keine Daten, wiederholbar.
-- ===========================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.empfehlungsprogramm_anfragen(_kontakt_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _k public.kontakte%ROWTYPE;
  _name text;
  _titel text;
  _nachricht text;
  _empfaenger uuid;
  _aufgabe_id uuid;
  _anzahl int := 0;
  _marker text;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Nicht angemeldet' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _k
  FROM public.kontakte
  WHERE id = _kontakt_id
    AND (
      (meta ->> 'authUserId') = _uid::text
      OR ((meta -> 'person2') ->> 'authUserId') = _uid::text
    );
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nicht berechtigt' USING ERRCODE = '42501';
  END IF;

  _name := trim(coalesce(_k.vorname, '') || ' ' || coalesce(_k.nachname, ''));
  _titel := 'Empfehlungsprogramm anfragen: ' || _name;
  _nachricht := _name || ' hat über das Kundenportal das Empfehlungsprogramm angefragt. '
    || 'Bitte Empfehlungsprogramm für ' || _name || ' erstellen und freigeben.';

  _marker := 'empfehlungsprogramm:' || _k.id::text;
  PERFORM pg_advisory_xact_lock(hashtext(_marker));

  IF EXISTS (
    SELECT 1 FROM public.aufgaben a
     WHERE a.kontakt_id = _k.id
       AND a.ausloeser_schluessel LIKE _marker || ':%'
       AND a.status IN ('offen', 'in_bearbeitung')
  ) THEN
    RETURN jsonb_build_object('bereits_offen', true, 'empfaenger', 0);
  END IF;

  FOR _empfaenger IN
    SELECT _k.zustaendig_id WHERE _k.zustaendig_id IS NOT NULL
    UNION
    SELECT DISTINCT ur.user_id
      FROM public.user_roles ur
     WHERE _k.zustaendig_id IS NULL
       AND ur.role IN ('admin'::public.app_role, 'inhaber'::public.app_role, 'vertriebsleiter'::public.app_role)
  LOOP
    INSERT INTO public.aufgaben (
      benutzer_id, zugewiesen_an, kontakt_id, titel, beschreibung, typ, prioritaet, status, faellig_am,
      ausloeser_schluessel, erstellt_von_name
    )
    VALUES (
      _empfaenger, _empfaenger, _k.id, _titel, _nachricht, 'aufgabe', 'hoch', 'offen', now(),
      _marker || ':' || to_char(clock_timestamp() AT TIME ZONE 'utc', 'YYYYMMDDHH24MISSUS'), 'Kundenportal'
    )
    RETURNING id INTO _aufgabe_id;

    INSERT INTO public.benachrichtigungen (benutzer_id, titel, nachricht, link)
    VALUES (
      _empfaenger,
      CASE WHEN _k.zustaendig_id IS NULL THEN 'Empfehlungsprogramm angefragt, ohne Zuständigkeit' ELSE _titel END,
      _nachricht,
      '/inbox?art=aufgabe&aufgabe=' || _aufgabe_id::text
    );
    _anzahl := _anzahl + 1;
  END LOOP;

  IF _anzahl = 0 THEN
    RAISE EXCEPTION 'Kein Empfänger für die Anfrage gefunden';
  END IF;

  RETURN jsonb_build_object('bereits_offen', false, 'empfaenger', _anzahl);
END;
$$;

REVOKE ALL ON FUNCTION public.empfehlungsprogramm_anfragen(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.empfehlungsprogramm_anfragen(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Nachsehen (aendert nichts): Pruefzeile 76.1 in
-- supabase/migrations-inbox/99_PRUEFUNG.sql.

-- ===========================================================================
-- Teil: 20261004180000_buchung_sprache.sql
-- ===========================================================================

-- ===========================================================================
-- Buchung: der neue Kontakt bekommt die Sprache der Buchungsseite
-- ===========================================================================
--
-- Befund vom 04.10.2026: Wer die Terminseite auf Englisch nutzt
-- (`?lang=en`), bekam Bestaetigung und Erinnerungen auf Deutsch. Die Mails
-- richten sich nach der Kundensprache am Kontakt (`_shared/buchung-kontext.ts`),
-- und `buchung_anlegen` legte den Kontakt ohne Sprache an, also Deutsch.
--
-- Neu ist eine zweite Fassung von `buchung_anlegen` mit dem Pflichtparameter
-- `_sprache`. Sie ruft die bestehende Fassung unveraendert auf und traegt
-- danach die Sprache ein, aber nur bei einem Kontakt, den genau diese Buchung
-- angelegt hat (Quelle Buchungslink, erstellt in derselben Transaktion) und
-- der noch keine Sprache hat. Ein bestehender Kontakt behaelt seine Sprache;
-- sie fuehrt das Kundenprofil. Eingetragen wird wie beim Lead aus einem
-- Formular (`submit-lead`): Sprache, Zeitpunkt, Quelle "buchung:Terminseite".
--
-- Alte Aufrufer ohne `_sprache` treffen weiter die bestehende Fassung, deren
-- Rumpf hier nicht angefasst wird. Die Seite schickt `_sprache` nur mit, wenn
-- die Sprache ausdruecklich in der Adresse steht, und faellt ohne diese
-- Migration auf den Aufruf ohne Sprache zurueck.
--
-- Steht fuer sich, Reihenfolge egal, keine Function auszurollen, aendert
-- keine Daten, wiederholbar.
-- ===========================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.buchung_anlegen(
  _token text,
  _terminart_id uuid,
  _start timestamptz,
  _name text,
  _email text,
  _sprache text,
  _telefon text DEFAULT NULL,
  _nachricht text DEFAULT NULL,
  _begleitung jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _ergebnis jsonb;
  _kontakt_id uuid;
BEGIN
  _ergebnis := public.buchung_anlegen(
    _token => _token,
    _terminart_id => _terminart_id,
    _start => _start,
    _name => _name,
    _email => _email,
    _telefon => _telefon,
    _nachricht => _nachricht,
    _begleitung => _begleitung
  );

  IF lower(btrim(coalesce(_sprache, ''))) IN ('de', 'en') AND (_ergebnis ->> 'id') IS NOT NULL THEN
    SELECT b.kontakt_id INTO _kontakt_id
      FROM public.buchungen b
     WHERE b.id = (_ergebnis ->> 'id')::uuid;

    UPDATE public.kontakte k
       SET meta = coalesce(k.meta, '{}'::jsonb) || jsonb_build_object(
             'kundenSprache', lower(btrim(_sprache)),
             'kundenSpracheGesetztAm', to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
             'kundenSpracheGesetztVon', 'buchung:Terminseite'
           )
     WHERE k.id = _kontakt_id
       AND k.quelle = 'Buchungslink'
       AND k.erstellt_am = now()
       AND NOT (coalesce(k.meta, '{}'::jsonb) ? 'kundenSprache');
  END IF;

  RETURN _ergebnis;
END;
$$;

REVOKE ALL ON FUNCTION public.buchung_anlegen(text, uuid, timestamptz, text, text, text, text, text, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.buchung_anlegen(text, uuid, timestamptz, text, text, text, text, text, jsonb) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Nachsehen (aendert nichts): Pruefzeile 77.1 in
-- supabase/migrations-inbox/99_PRUEFUNG.sql.

-- ===========================================================================
-- Teil: 20261004190000_termin_erinnerungen_kopf.sql
-- ===========================================================================

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

-- ===========================================================================
-- Teil: 20261004191000_benachrichtigungen_sperre_eindeutig.sql
-- ===========================================================================

-- ===========================================================================
-- Glocken mit Sperrschluessel: je Empfaenger und Schluessel nur eine Zeile
-- ===========================================================================
--
-- WARUM
--
-- eigene-investments-reminders schreibt seit dem 04.10.2026 je Anlass einen
-- Sperrschluessel in benachrichtigungen.meta.sperre und prueft vor dem
-- Einfuegen, ob es ihn schon gibt. Laufen zwei Aufrufe gleichzeitig, sehen
-- beide "noch nicht da" und der Kunde bekommt die Glocke zweimal. Ein
-- eindeutiger Index schliesst das in der Datenbank aus; die Function
-- ueberspringt die Ablehnung (23505) still.
--
-- WAS DIESE MIGRATION TUT
--
-- Legt den Teilindex benachrichtigungen_sperre_eindeutig auf
-- (benutzer_id, meta ->> 'sperre') an, nur fuer Zeilen mit diesem Schluessel.
-- Gibt es schon doppelte Zeilen, wird NICHTS angelegt und nichts geloescht,
-- es kommt nur eine Warnung; Pruefzeile 80.3 zaehlt sie. Aendert keine
-- Daten, wiederholbar.
--
-- REIHENFOLGE
--
-- Steht fuer sich, Reihenfolge egal. Ohne den Index laeuft die Function wie
-- bisher, nur ohne Schutz gegen gleichzeitige Laeufe.
-- ===========================================================================

DO $index$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM public.benachrichtigungen
     WHERE meta ? 'sperre'
     GROUP BY benutzer_id, meta ->> 'sperre'
    HAVING count(*) > 1
  ) THEN
    RAISE WARNING 'Es gibt doppelte Glocken mit demselben Sperrschluessel. Der Index wurde NICHT angelegt, es wurde nichts geloescht. Pruefzeile 80.3 zaehlt sie.';
    RETURN;
  END IF;

  CREATE UNIQUE INDEX IF NOT EXISTS benachrichtigungen_sperre_eindeutig
    ON public.benachrichtigungen (benutzer_id, (meta ->> 'sperre'))
    WHERE meta ? 'sperre';
END
$index$;

-- Nachsehen (aendert nichts): Pruefzeilen 80.2 und 80.3 in
-- supabase/migrations-inbox/99_PRUEFUNG.sql.

-- ===========================================================================
-- Teil: 20261004193000_objekt_loeschen.sql
-- ===========================================================================

-- ===========================================================================
-- Objekt und Einheit loeschen: Pruefung in der Datenbank
-- ===========================================================================
--
-- Seit dem 04.10.2026 sperrt die Oberflaeche das Loeschen eines Objekts oder
-- einer Einheit, wenn eine Einheit gebunden ist (reserviert, verkauft, Kunde,
-- Vormerkung, Investagon, Investment, gesendeter Kundenlink) oder das ganze
-- Haus belegt ist. Bisher pruefte nur der Browser, und ein direktes DELETE
-- ueber die Schnittstelle ging an allem vorbei.
--
-- Diese Migration legt die Regeln in die Datenbank:
--   1. `einheit_loesch_grund(jsonb)` und `objekt_loesch_grund(uuid)` liefern
--      den Grund als Satzteil oder NULL, ohne Zeilensicherheit.
--   2. BEFORE-DELETE-Ausloeser auf `objekte` und `wohnungen` lehnen ein
--      Loeschen mit Grund ab, sobald es aus dem Browser kommt: Rolle im
--      Anmeldetoken `authenticated` oder `anon`. Das gilt auch, wenn ein
--      Browser-Aufruf ueber eine Funktion loescht, etwa `objekt_loeschen`.
--      Die Dienstrolle (Edge Functions wie der Investagon-Import) und der
--      SQL-Editor ohne Token bleiben unberuehrt. Der Token und nicht
--      current_user, weil die Ausloeser als SECURITY DEFINER laufen muessen,
--      um die gesperrten Pruefungen aufzurufen.
--   3. `objekt_loeschen(uuid)` sperrt Objekt und Einheiten (FOR UPDATE),
--      prueft das Recht wie die Loeschregel auf `objekte` (Admin und Inhaber,
--      oder objektpartner am eigenen Objekt; ohne `erstellt_von` nie) und
--      dieselben Gruende, und loescht dann samt Kaskade.
--
-- Heutige Loeschwege bleiben: Einheit loeschen und Objekt speichern pruefen
-- im Browser dieselben Gruende und loeschen nur Freies; der Investagon-Import
-- loescht mit der Dienstrolle. Ein neues Objekt, dessen Speichern scheitert,
-- wird wieder entfernt; traegt eine seiner Einheiten schon „verkauft“,
-- bleibt es jetzt stehen und muss von Hand entfernt werden.
--
-- Restrisiko: Ein Investment, das gleichzeitig mit dem Loeschen auf eine
-- Einheit gesetzt wird, sperrt die Einheit nicht, weil Investments nicht
-- mitgesperrt werden.
--
-- Steht fuer sich, Reihenfolge egal, keine Function auszurollen, aendert
-- keine Daten, wiederholbar.
-- ===========================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.einheit_loesch_grund(_w jsonb)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _anzahl int;
BEGIN
  IF lower(btrim(coalesce(_w ->> 'status', ''))) = 'verkauft' THEN
    RETURN 'verkauft';
  END IF;
  IF lower(btrim(coalesce(_w ->> 'status', ''))) IN ('reserviert', 'gesetzt')
     OR nullif(btrim(coalesce(_w ->> 'reserviert_von', '')), '') IS NOT NULL THEN
    RETURN 'reserviert';
  END IF;
  IF nullif(btrim(coalesce(_w ->> 'kunde_id', '')), '') IS NOT NULL
     OR nullif(btrim(coalesce(_w ->> 'kunde_name', '')), '') IS NOT NULL THEN
    RETURN 'mit Kunde';
  END IF;
  IF (_w ->> 'vorgemerkt_bis') IS NOT NULL AND (_w ->> 'vorgemerkt_bis')::timestamptz > now() THEN
    RETURN 'vorgemerkt';
  END IF;
  IF nullif(btrim(coalesce(_w -> 'meta' ->> 'investagonId', '')), '') IS NOT NULL THEN
    RETURN 'aus Investagon';
  END IF;
  SELECT count(*) INTO _anzahl
    FROM public.investments i
   WHERE (i.meta ->> 'wohnungId') = (_w ->> 'id');
  IF _anzahl > 0 THEN
    RETURN 'Investment verweist darauf';
  END IF;
  IF to_regclass('public.objekt_exposes') IS NOT NULL THEN
    EXECUTE $q$
      SELECT count(*) FROM public.objekt_exposes e
       WHERE (to_jsonb(e) ->> 'wohnung_id' = $1 OR to_jsonb(e) ->> 'einstieg_wohnung_id' = $1)
         AND (to_jsonb(e) ->> 'gesendet_am') IS NOT NULL
         AND (to_jsonb(e) ->> 'zurueckgezogen_am') IS NULL
    $q$ INTO _anzahl USING (_w ->> 'id');
    IF _anzahl > 0 THEN
      RETURN 'gesendeter Kundenlink';
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.objekt_loesch_grund(_objekt_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _o jsonb;
  _w jsonb;
  _grund text;
  _gruende text[] := '{}';
  _anzahl int;
BEGIN
  SELECT to_jsonb(o) INTO _o FROM public.objekte o WHERE o.id = _objekt_id;
  IF _o IS NULL THEN
    RETURN NULL;
  END IF;
  IF coalesce(nullif(btrim(_o ->> 'belegung'), ''), 'frei') <> 'frei'
     OR nullif(btrim(coalesce(_o ->> 'belegung_kunde_id', '')), '') IS NOT NULL THEN
    RETURN 'das ganze Haus reserviert oder verkauft ist';
  END IF;
  SELECT count(*) INTO _anzahl
    FROM public.investments i
   WHERE (i.meta ->> 'objektId') = _objekt_id::text;
  IF _anzahl > 0 THEN
    RETURN CASE WHEN _anzahl = 1 THEN 'ein Investment' ELSE _anzahl || ' Investments' END
      || ' auf das Objekt verweisen';
  END IF;
  FOR _w IN SELECT to_jsonb(w) FROM public.wohnungen w WHERE w.objekt_id = _objekt_id LOOP
    _grund := public.einheit_loesch_grund(_w);
    IF _grund IS NOT NULL THEN
      _gruende := _gruende || ('Einheit „' || coalesce(nullif(btrim(_w ->> 'we_nr'), ''), '?') || '“ (' || _grund || ')');
    END IF;
  END LOOP;
  IF cardinality(_gruende) > 0 THEN
    RETURN 'Einheiten gebunden sind: ' || array_to_string(_gruende[1:3], ', ')
      || CASE WHEN cardinality(_gruende) > 3 THEN ' und ' || (cardinality(_gruende) - 3) || ' weitere' ELSE '' END;
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.loeschen_aus_dem_browser()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    ''
  ) IN ('authenticated', 'anon');
$$;

REVOKE ALL ON FUNCTION public.einheit_loesch_grund(jsonb) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.objekt_loesch_grund(uuid) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.objekt_loeschen_pruefen()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _grund text;
BEGIN
  IF NOT public.loeschen_aus_dem_browser() THEN
    RETURN OLD;
  END IF;
  _grund := public.objekt_loesch_grund(OLD.id);
  IF _grund IS NOT NULL THEN
    RAISE EXCEPTION 'Das Objekt kann nicht gelöscht werden, weil %.', _grund USING ERRCODE = 'P0001';
  END IF;
  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION public.einheit_loeschen_pruefen()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _grund text;
BEGIN
  IF NOT public.loeschen_aus_dem_browser() THEN
    RETURN OLD;
  END IF;
  _grund := public.einheit_loesch_grund(to_jsonb(OLD));
  IF _grund IS NOT NULL THEN
    RAISE EXCEPTION 'Einheit „%“ kann nicht gelöscht werden (%).',
      coalesce(nullif(btrim(to_jsonb(OLD) ->> 'we_nr'), ''), '?'), _grund
      USING ERRCODE = 'P0001';
  END IF;
  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.objekt_loeschen_pruefen() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.einheit_loeschen_pruefen() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS trg_objekt_loeschen_pruefen ON public.objekte;
CREATE TRIGGER trg_objekt_loeschen_pruefen
  BEFORE DELETE ON public.objekte
  FOR EACH ROW EXECUTE FUNCTION public.objekt_loeschen_pruefen();

DROP TRIGGER IF EXISTS trg_einheit_loeschen_pruefen ON public.wohnungen;
CREATE TRIGGER trg_einheit_loeschen_pruefen
  BEFORE DELETE ON public.wohnungen
  FOR EACH ROW EXECUTE FUNCTION public.einheit_loeschen_pruefen();

CREATE OR REPLACE FUNCTION public.objekt_loeschen(_objekt_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _o jsonb;
  _grund text;
  _anzahl int;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Nicht angemeldet' USING ERRCODE = '42501';
  END IF;

  SELECT to_jsonb(o) INTO _o FROM public.objekte o WHERE o.id = _objekt_id FOR UPDATE;
  IF _o IS NULL THEN
    RAISE EXCEPTION 'Das Objekt wurde nicht gefunden. Vielleicht hat es inzwischen jemand anderes entfernt.'
      USING ERRCODE = 'P0002';
  END IF;
  PERFORM 1 FROM public.wohnungen w WHERE w.objekt_id = _objekt_id FOR UPDATE;

  IF NOT (
    coalesce(public.is_admin_role(_uid), false)
    OR (
      coalesce(public.has_role(_uid, 'objektpartner'::public.app_role), false)
      AND (_o ->> 'erstellt_von') IS NOT NULL
      AND (_o ->> 'erstellt_von') = _uid::text
    )
  ) THEN
    RAISE EXCEPTION 'Dieses Objekt darfst du nicht löschen.' USING ERRCODE = '42501';
  END IF;

  _grund := public.objekt_loesch_grund(_objekt_id);
  IF _grund IS NOT NULL THEN
    RAISE EXCEPTION 'Das Objekt kann nicht gelöscht werden, weil %.', _grund USING ERRCODE = 'P0001';
  END IF;

  DELETE FROM public.objekte WHERE id = _objekt_id;
  GET DIAGNOSTICS _anzahl = ROW_COUNT;
  IF _anzahl <> 1 THEN
    RAISE EXCEPTION 'Das Objekt konnte nicht gelöscht werden.' USING ERRCODE = 'P0001';
  END IF;

  RETURN jsonb_build_object('geloescht', true);
END;
$$;

REVOKE ALL ON FUNCTION public.objekt_loeschen(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.objekt_loeschen(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Nachsehen (aendert nichts): Pruefzeilen 78.1 und 78.2 in
-- supabase/migrations-inbox/99_PRUEFUNG.sql.

-- ===========================================================================
-- Teil: 20261004195000_sicherung_zeitplan.sql
-- ===========================================================================

-- ===========================================================================
-- Zeitplan fuer die naechtliche Sicherung (daily-backup)
-- ===========================================================================
--
-- WARUM
--
-- daily-backup hatte nie einen Zeitplan, die Sicherung lief also nie.
-- GL hat am 04.10.2026 zugestimmt, dass sie jede Nacht laeuft.
-- daily-backup prueft seit dem 04.10.2026 automatikSchutz im strengen Modus:
-- Ohne den Kopf x-internal-secret mit dem Geheimwort weist es ab.
--
-- DER PAPIERKORB BLEIBT (Entscheidung GL, 04.10.2026)
--
-- auto-purge-papierkorb bekommt bewusst KEINEN Zeitplan. Es wuerde Kontakte
-- nach 90 Tagen im Papierkorb endgueltig loeschen, samt Investments. Nichts
-- wird automatisch geloescht. Ein Zeitplan namens papierkorb-leeren-taeglich
-- wird entfernt, falls es ihn gibt. Die Function bleibt streng geschuetzt.
--
-- WAS DIE SICHERUNG TUT (gelesen am 04.10.2026)
--
-- Sie liest 14 Tabellen (kontakte, anrufe, aufgaben, benachrichtigungen,
-- chat_gruppen, chat_nachrichten, chat_teilnehmer, emails, lexikon, news,
-- pipeline, unterlagen_dokumente, unterlagen_highlights,
-- unterlagen_kategorien; zusammen rund 12 MB) und legt sie als JSON im nicht
-- oeffentlichen Eimer `backups` ab, ein Ordner je Tag. Ordner aelter als 30
-- Tage loescht sie selbst. Investments, Objekte und Wohnungen sind nicht
-- dabei.
--
-- UHRZEIT
--
-- pg_cron rechnet in UTC. 01:00 UTC ist 03:00 Sommerzeit und 02:00
-- Winterzeit, also immer nachts, und faellt nicht mit der naechtlichen
-- Abmeldung (jede Stunde zur halben Stunde) zusammen.
--
-- WAS DIESE MIGRATION TUT
--
-- Legt den Zeitplan sicherung-taeglich nach dem Muster der uebrigen an:
-- net.http_post an /functions/v1/daily-backup, Kopf mit apikey und
-- Authorization (oeffentlicher Schluessel, die Function verlangt eine
-- Anmeldung am Gateway) und x-internal-secret aus
-- public.automatik_geheimnis().
--
-- Der oeffentliche Schluessel steht nicht in dieser Datei. Er wird zur
-- Laufzeit aus einem vorhandenen Zeitplan gelesen, und nur ein Schluessel
-- mit der Rolle anon zaehlt. Das Geheimwort steht ebenfalls nicht im Befehl,
-- nur der Weg zu ihm. Ohne Geheimwort im Tresor oder ohne gefundenen
-- Schluessel legt sie nichts an und warnt. Wiederholbar: Ein vorhandener
-- Zeitplan gleichen Namens wird ersetzt. Aendert keine Tabellendaten.
--
-- REIHENFOLGE
--
-- Nach dem Ausrollen von daily-backup. Braucht public.automatik_geheimnis()
-- aus 20260916130000.
-- ===========================================================================

DO $zeitplan$
DECLARE
  _url text := 'https://irwdgutegmivbtgmftyc.supabase.co/functions/v1/daily-backup';
  _anon text;
  _kandidat text;
  _teil text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     OR NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    RAISE WARNING 'pg_cron oder pg_net fehlt. Es wurde nichts angelegt.';
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'papierkorb-leeren-taeglich') THEN
    PERFORM cron.unschedule('papierkorb-leeren-taeglich');
    RAISE NOTICE 'Zeitplan "papierkorb-leeren-taeglich" entfernt. Der Papierkorb bleibt bestehen.';
  END IF;

  IF public.automatik_geheimnis() = '' THEN
    RAISE WARNING 'Im Tresor liegt kein Geheimwort unter dem Namen AUTOMATIK_GEHEIMWORT. Es wurde KEIN Zeitplan angelegt.';
    RETURN;
  END IF;

  FOR _kandidat IN
    SELECT (regexp_match(command, 'apikey[^e]{1,8}(eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)'))[1]
      FROM cron.job
     ORDER BY jobid
  LOOP
    CONTINUE WHEN _kandidat IS NULL;
    BEGIN
      _teil := translate(split_part(_kandidat, '.', 2), '-_', '+/');
      _teil := rpad(_teil, ((length(_teil) + 3) / 4) * 4, '=');
      IF convert_from(decode(_teil, 'base64'), 'UTF8')::jsonb ->> 'role' = 'anon' THEN
        _anon := _kandidat;
        EXIT;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      CONTINUE;
    END;
  END LOOP;

  IF _anon IS NULL THEN
    RAISE WARNING 'In keinem vorhandenen Zeitplan steht ein oeffentlicher Schluessel (apikey, Rolle anon). Es wurde KEIN Zeitplan angelegt.';
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sicherung-taeglich') THEN
    PERFORM cron.unschedule('sicherung-taeglich');
  END IF;

  PERFORM cron.schedule(
    'sicherung-taeglich',
    '0 1 * * *',
    format(
      $befehl$SELECT net.http_post(url := %L, headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', %L, 'Authorization', %L, 'x-internal-secret', public.automatik_geheimnis()), body := '{}'::jsonb, timeout_milliseconds := 150000);$befehl$,
      _url,
      _anon,
      'Bearer ' || _anon
    )
  );
  RAISE NOTICE 'Zeitplan "sicherung-taeglich" (daily-backup) um 01:00 UTC angelegt.';
END
$zeitplan$;

-- Nachsehen (aendert nichts): Pruefzeilen 81.1 und 81.2 in
-- supabase/migrations-inbox/99_PRUEFUNG.sql.

-- ===========================================================================
-- Teil: 20261005100000_kundenlink_wohnungsauswahl.sql
-- ===========================================================================

-- ===========================================================================
-- Kundenlink: Wohnungsauswahl der Objektübersicht
-- ===========================================================================
--
-- WARUM ES DIESE MIGRATION GIBT
--
--   GL, 05.10.2026: Im Fenster „Kundenlink senden“ wählt er bei der
--   Objektübersicht, welche freien Wohnungen des Hauses der Kunde über den
--   Link sieht. Die Einschränkung muss auf dem Server gelten, nicht nur in
--   der Oberfläche: `get-kundenansicht` gibt nur die gewählten Wohnungen
--   heraus, auch wenn jemand eine andere Wohnungskennung in die Adresse
--   schreibt.
--
-- WAS SIE TUT
--
--   Spalte `objekt_exposes.wohnung_auswahl` (uuid[]), leer erlaubt.
--     - leer (NULL): keine Auswahl, der Kunde sieht alle freien Wohnungen.
--       So bleiben alle vorhandenen Links, und so speichert der Versand, wenn
--       im Fenster alle Wohnungen angehakt sind.
--     - eine Liste: nur diese Wohnungen, solange sie frei sind. Wird eine
--       reserviert oder verkauft, fällt sie wie bisher weg.
--   Erneut senden ersetzt die Auswahl des bestehenden Links.
--   Eine Prüfregel lässt eine Liste nur bei der Objektübersicht zu und nie
--   leer.
--
--   Auslöser `trg_objekt_exposes_kundenlink_nur_server` (Prüfung Codex,
--   05.10.2026): `art` und `wohnung_auswahl` ändert nur der Server
--   (`send-kunden-expose` mit Dienstrolle, SQL-Editor). Aus dem Browser
--   (Rolle im Token `authenticated` oder `anon`) lehnt die Datenbank eine
--   Änderung ab, beim Anlegen alles außer art = 'expose' ohne Auswahl. Sonst
--   könnte jemand mit Schreibrecht auf die Zeile die Auswahl seines Links
--   aufheben. Der Browser schreibt beide Spalten heute nirgends: Er legt nur
--   interne Exposés an (`speichereExpose`, ohne `art`) und setzt
--   `zurueckgezogen_am`. Andere Spalten bleiben unberührt, auch für
--   SECURITY-DEFINER-Funktionen wie `kontakte_zusammenfuehren`.
--
-- VORAUSSETZUNG
--
--   20260923171000_kundenlink_objektuebersicht.sql (Spalte `art`, am
--   24.09.2026 gelaufen). Fehlt sie, bricht diese Migration am Anfang ab und
--   ändert nichts.
--
-- OHNE DIESE MIGRATION
--
--   Alles läuft wie bisher: Die Objektübersicht geht mit allen Wohnungen
--   hinaus. Nur eine echte Auswahl lehnt `send-kunden-expose` mit
--   „Migration Wohnungsauswahl noch nicht ausgeführt“ ab, bevor etwas
--   geschrieben oder verschickt wird.
--
-- ZURÜCKDREHEN (falls nötig)
--
--   drop trigger if exists trg_objekt_exposes_kundenlink_nur_server on public.objekt_exposes;
--   drop function if exists public.objekt_exposes_kundenlink_nur_server();
--   alter table public.objekt_exposes drop constraint if exists objekt_exposes_wohnung_auswahl_check;
--   alter table public.objekt_exposes drop column if exists wohnung_auswahl;
--
--   Achtung: Danach zeigen eingeschränkte Links wieder alle freien Wohnungen.
--
-- WIEDERHOLBAR, ÄNDERT KEINE DATEN. Reihenfolge egal, am besten aber vor
-- dem Ausrollen von get-kundenansicht und send-kunden-expose.
-- ===========================================================================


DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'objekt_exposes'
       AND column_name = 'art'
  ) THEN
    RAISE EXCEPTION 'Zuerst 20260923171000_kundenlink_objektuebersicht.sql ausführen, dann diese Migration.';
  END IF;
END $$;


ALTER TABLE public.objekt_exposes
  ADD COLUMN IF NOT EXISTS wohnung_auswahl uuid[];

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'objekt_exposes_wohnung_auswahl_check'
  ) THEN
    ALTER TABLE public.objekt_exposes
      ADD CONSTRAINT objekt_exposes_wohnung_auswahl_check
      CHECK (wohnung_auswahl IS NULL OR (art = 'objektuebersicht' AND cardinality(wohnung_auswahl) >= 1));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.objekt_exposes_kundenlink_nur_server()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '')
       NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.art IS DISTINCT FROM 'expose' OR NEW.wohnung_auswahl IS NOT NULL THEN
      RAISE EXCEPTION 'Kundenlinks der Objektübersicht legt nur „Kundenlink senden“ an.' USING ERRCODE = '42501';
    END IF;
  ELSIF NEW.art IS DISTINCT FROM OLD.art OR NEW.wohnung_auswahl IS DISTINCT FROM OLD.wohnung_auswahl THEN
    RAISE EXCEPTION 'Art und Wohnungsauswahl eines Kundenlinks ändert nur „Kundenlink senden“.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.objekt_exposes_kundenlink_nur_server() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS trg_objekt_exposes_kundenlink_nur_server ON public.objekt_exposes;
CREATE TRIGGER trg_objekt_exposes_kundenlink_nur_server
  BEFORE INSERT OR UPDATE ON public.objekt_exposes
  FOR EACH ROW EXECUTE FUNCTION public.objekt_exposes_kundenlink_nur_server();

COMMENT ON COLUMN public.objekt_exposes.wohnung_auswahl IS
  'Nur bei der Objektübersicht: die Wohnungen, die der Kunde über den Link sieht, solange sie frei sind. Leer: alle freien Wohnungen.';


-- Zum Schluss: der Stand danach. Erwartet: dreimal true.
SELECT
  EXISTS (SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'objekt_exposes' AND column_name = 'wohnung_auswahl') AS spalte_wohnung_auswahl,
  EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'objekt_exposes_wohnung_auswahl_check') AS pruefregel_wohnung_auswahl,
  EXISTS (SELECT 1 FROM pg_trigger
           WHERE tgname = 'trg_objekt_exposes_kundenlink_nur_server'
             AND tgrelid = 'public.objekt_exposes'::regclass AND NOT tgisinternal) AS ausloeser_nur_server;

-- ===========================================================================
-- Teil: 20261005110000_expose_lesen_nach_kundenzugriff.sql
-- ===========================================================================

-- ===========================================================================
-- Exposés lesen nur, solange man den Kunden noch sehen darf
-- ===========================================================================
--
-- Prüfung Codex vom 05.10.2026: Seit Vertriebspartner Kundenlinks senden und
-- das interne Exposé öffnen, liest der Ersteller eine Zeile aus
-- `objekt_exposes` dauerhaft (Regel aus 20260902200000), auch wenn der Kunde
-- längst an einen anderen Partner übergeben ist. Die Zeile trägt Annahmen,
-- Token und Versanddaten zu genau diesem Kunden.
--
-- Neu:
--   - Admin und Inhaber lesen alles, wie bisher.
--   - Ohne Kundenbezug (neutrale Vorschau) liest nur der Ersteller.
--   - Mit Kundenbezug lesen der Zuständige wie bisher und der Ersteller nur,
--     solange er den Kontakt sehen darf: `darf_alle_kunden_sehen` oder
--     `is_vp_owner_of_kontakt` (eigene und vertretene Kunden).
--
-- Unberührt: die Dienstrolle. `get-expose`, `get-kundenansicht` und
-- `send-kunden-expose` lesen mit dem Dienstschlüssel, Kundenlinks bleiben
-- also erreichbar. Anlegen, Ändern und Löschen bleiben, wie sie sind.
--
-- Ändert keine Daten, wiederholbar. Ohne sie gilt die alte Regel weiter.
-- ===========================================================================

DO $$
BEGIN
  IF to_regprocedure('public.darf_alle_kunden_sehen(uuid)') IS NULL
     OR to_regprocedure('public.is_vp_owner_of_kontakt(uuid, uuid, jsonb)') IS NULL
     OR to_regprocedure('public.is_admin_role(uuid)') IS NULL THEN
    RAISE EXCEPTION 'darf_alle_kunden_sehen, is_vp_owner_of_kontakt oder is_admin_role fehlt, bitte zuerst 20260916190000 und 20260807150000 ausfuehren.';
  END IF;
  IF to_regclass('public.objekt_exposes') IS NULL THEN
    RAISE EXCEPTION 'Tabelle objekt_exposes fehlt, bitte zuerst 20260902200000 ausfuehren.';
  END IF;
END $$;

DROP POLICY IF EXISTS "Exposes lesen" ON public.objekt_exposes;
CREATE POLICY "Exposes lesen"
  ON public.objekt_exposes FOR SELECT TO authenticated
  USING (
    public.is_admin_role(auth.uid())
    OR (
      objekt_exposes.kontakt_id IS NULL
      AND objekt_exposes.erstellt_von = auth.uid()
    )
    OR (
      objekt_exposes.kontakt_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.kontakte k
        WHERE k.id = objekt_exposes.kontakt_id
          AND (
            k.zustaendig_id = auth.uid()
            OR (
              objekt_exposes.erstellt_von = auth.uid()
              AND (
                COALESCE(public.darf_alle_kunden_sehen(auth.uid()), false)
                OR COALESCE(public.is_vp_owner_of_kontakt(auth.uid(), k.zustaendig_id, k.meta), false)
              )
            )
          )
      )
    )
  );

-- Zum Schluss: der Stand danach. Erwartet: true.
SELECT EXISTS (
  SELECT 1 FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'objekt_exposes' AND policyname = 'Exposes lesen'
     AND qual LIKE '%darf_alle_kunden_sehen%' AND qual LIKE '%is_vp_owner_of_kontakt%'
) AS leseregel_nach_kundenzugriff;

-- Nachsehen (aendert nichts): Pruefzeile 86.1 in
-- supabase/migrations-inbox/99_PRUEFUNG.sql.

-- ===========================================================================
-- Teil: 20261005120000_provision_intern_sperren.sql
-- ===========================================================================

-- ===========================================================================
-- Provisionsfelder aus Investagon nur für Admin, Inhaber und Buchhaltung
-- ===========================================================================
--
-- Vorgabe GL vom 05.10.2026: Vertriebspartner und alle anderen Rollen
-- sehen keine Provisionsangaben aus den Investagon-Objektdaten, weder in der
-- Oberfläche noch über die Datenbank. Lesen dürfen Admin, Inhaber und
-- Buchhaltung.
--
-- Befund: `objekte` und `wohnungen` liest jede interne Rolle samt `meta`, und
-- dort lag der ganze Investagon-Datensatz (`meta.investagonRaw`) mit
-- Provision, Provisionsvermerk, Käuferprovision und Vertriebsmakler.
--
-- Nicht betroffen (Korrektur GL vom selben Tag): Die
-- Eigenprovisionsvereinbarungen (Kategorie „intern“, 15 Unterlagen) gehören
-- dem Käufer und bleiben für alle Objektrollen sichtbar, samt Eintrag in
-- `meta.investagonRaw.files`. Ebenfalls nicht verlegt, weil Kaufpreis und
-- Miteigentumsanteil, die Exposé, Rechner und Kundenansicht brauchen:
-- `purchase_price_*`, `object_share_owner`. Keines der verlegten Felder ist
-- die Eigenprovision des Käufers (lesend geprüft am 05.10.2026).
--
-- Neu:
--   1. Tabelle `investagon_intern`, je Objekt beziehungsweise Einheit eine
--      Zeile mit den abgetrennten Feldern. Lesen nur Admin, Inhaber und
--      Buchhaltung, schreiben nur die Dienstrolle (über den Auslöser).
--   2. `investagon_roh_trennen(jsonb)` trennt einen Investagon-Datensatz in
--      den Teil für `meta` und die Provisionsfelder. Feldliste aus den echten
--      Daten (Stand 05.10.2026).
--   3. Auslöser auf `objekte` und `wohnungen`: Wer `meta` schreibt, bekommt
--      die Provisionsfelder abgetrennt. Schreibt die Dienstrolle (der
--      Import), landen sie in `investagon_intern` und ergänzen, was dort
--      steht; sonst werden sie verworfen. So schreibt auch ein noch nicht
--      neu ausgerollter Import oder ein alter Browser-Tab nichts mehr davon
--      in `meta`.
--   4. Bestand in einer Transaktion unter Sperre: kopieren, vergleichen
--      (bricht bei einer Abweichung ab, bevor etwas entfernt wird), Auslöser
--      setzen, aus `meta` entfernen. Die Sperre hält den Import an, bis
--      alles durch ist, damit dazwischen nichts unkopiert in `meta` landet.
--
-- Ändert Bestandsdaten (nur `meta.investagonRaw` von 97 Objekten und 618
-- Einheiten), vorher vollständige Kopie. Wiederholbar: Ein zweiter Lauf
-- findet nichts mehr zu kopieren und lässt die Kopie stehen.
-- ===========================================================================

BEGIN;

DO $$
BEGIN
  IF to_regprocedure('public.is_admin_role(uuid)') IS NULL
     OR to_regprocedure('public.has_role(uuid, public.app_role)') IS NULL THEN
    RAISE EXCEPTION 'is_admin_role oder has_role fehlt, bitte zuerst die Rollenmigrationen ausfuehren.';
  END IF;
END $$;

LOCK TABLE public.objekte, public.wohnungen IN SHARE ROW EXCLUSIVE MODE;

-- 1. Die Tabelle --------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.investagon_intern (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  objekt_id uuid UNIQUE REFERENCES public.objekte(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  wohnung_id uuid UNIQUE REFERENCES public.wohnungen(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  felder jsonb NOT NULL DEFAULT '{}'::jsonb,
  aktualisiert_am timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT investagon_intern_genau_ein_bezug CHECK ((objekt_id IS NULL) <> (wohnung_id IS NULL))
);

ALTER TABLE public.investagon_intern ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.investagon_intern FROM anon, authenticated;
GRANT SELECT ON public.investagon_intern TO authenticated;

DROP POLICY IF EXISTS "Investagon intern nur Admin und Inhaber" ON public.investagon_intern;
DROP POLICY IF EXISTS "Investagon intern Admin Inhaber Buchhaltung" ON public.investagon_intern;
CREATE POLICY "Investagon intern Admin Inhaber Buchhaltung"
  ON public.investagon_intern FOR SELECT TO authenticated
  USING (
    public.is_admin_role(auth.uid())
    OR public.has_role(auth.uid(), 'buchhaltung'::public.app_role)
  );

-- 2. Die Trennung -------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.investagon_roh_trennen(roh jsonb, OUT oeffentlich jsonb, OUT intern jsonb)
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  WITH felder(k) AS (
    VALUES ('commission'), ('commission_comment'), ('userCommissions'),
           ('selling_price_commission'), ('selling_price_commission_manual'),
           ('sellingPriceCommission'), ('transaction_broker_rate'), ('listing_broker')
  )
  SELECT
    roh - ARRAY(SELECT k FROM felder),
    coalesce((SELECT jsonb_object_agg(k, roh -> k) FROM felder WHERE roh ? k), '{}'::jsonb)
$$;

-- 3. Der Auslöser -------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.investagon_intern_abtrennen()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  teile record;
BEGIN
  IF jsonb_typeof(NEW.meta -> 'investagonRaw') IS DISTINCT FROM 'object' THEN
    RETURN NEW;
  END IF;
  SELECT * INTO teile FROM public.investagon_roh_trennen(NEW.meta -> 'investagonRaw');
  IF teile.intern = '{}'::jsonb THEN
    RETURN NEW;
  END IF;
  NEW.meta := jsonb_set(NEW.meta, '{investagonRaw}', teile.oeffentlich);

  -- Nur die Dienstrolle (Import) pflegt die Kopie. Aus dem Browser kommt
  -- höchstens ein veralteter Stand, der wird nur verworfen.
  IF auth.uid() IS NULL THEN
    IF TG_TABLE_NAME = 'objekte' THEN
      INSERT INTO public.investagon_intern (objekt_id, felder) VALUES (NEW.id, teile.intern)
      ON CONFLICT (objekt_id) DO UPDATE SET felder = investagon_intern.felder || EXCLUDED.felder, aktualisiert_am = now()
        WHERE investagon_intern.felder || EXCLUDED.felder IS DISTINCT FROM investagon_intern.felder;
    ELSE
      INSERT INTO public.investagon_intern (wohnung_id, felder) VALUES (NEW.id, teile.intern)
      ON CONFLICT (wohnung_id) DO UPDATE SET felder = investagon_intern.felder || EXCLUDED.felder, aktualisiert_am = now()
        WHERE investagon_intern.felder || EXCLUDED.felder IS DISTINCT FROM investagon_intern.felder;
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- 4a. Bestand kopieren ----------------------------------------------------------

INSERT INTO public.investagon_intern (objekt_id, felder)
SELECT o.id, t.intern
  FROM public.objekte o, LATERAL public.investagon_roh_trennen(o.meta -> 'investagonRaw') t
 WHERE jsonb_typeof(o.meta -> 'investagonRaw') = 'object' AND t.intern <> '{}'::jsonb
ON CONFLICT (objekt_id) DO UPDATE SET felder = investagon_intern.felder || EXCLUDED.felder, aktualisiert_am = now();

INSERT INTO public.investagon_intern (wohnung_id, felder)
SELECT w.id, t.intern
  FROM public.wohnungen w, LATERAL public.investagon_roh_trennen(w.meta -> 'investagonRaw') t
 WHERE jsonb_typeof(w.meta -> 'investagonRaw') = 'object' AND t.intern <> '{}'::jsonb
ON CONFLICT (wohnung_id) DO UPDATE SET felder = investagon_intern.felder || EXCLUDED.felder, aktualisiert_am = now();

-- 4b. Vergleichen, bevor etwas entfernt wird ----------------------------------------

DO $$
DECLARE
  fehlt integer;
BEGIN
  SELECT
    (SELECT count(*) FROM public.objekte o, LATERAL public.investagon_roh_trennen(o.meta -> 'investagonRaw') t
      WHERE jsonb_typeof(o.meta -> 'investagonRaw') = 'object' AND t.intern <> '{}'::jsonb
        AND NOT EXISTS (SELECT 1 FROM public.investagon_intern i WHERE i.objekt_id = o.id AND i.felder @> t.intern))
  + (SELECT count(*) FROM public.wohnungen w, LATERAL public.investagon_roh_trennen(w.meta -> 'investagonRaw') t
      WHERE jsonb_typeof(w.meta -> 'investagonRaw') = 'object' AND t.intern <> '{}'::jsonb
        AND NOT EXISTS (SELECT 1 FROM public.investagon_intern i WHERE i.wohnung_id = w.id AND i.felder @> t.intern))
  INTO fehlt;
  IF fehlt > 0 THEN
    RAISE EXCEPTION 'Kopie unvollstaendig: % Zeilen weichen ab, nichts entfernt.', fehlt;
  END IF;
END $$;

-- 4c. Auslöser setzen, dann aus meta entfernen -------------------------------------

DROP TRIGGER IF EXISTS trg_investagon_intern_abtrennen ON public.objekte;
CREATE TRIGGER trg_investagon_intern_abtrennen
  BEFORE INSERT OR UPDATE OF meta ON public.objekte
  FOR EACH ROW EXECUTE FUNCTION public.investagon_intern_abtrennen();

DROP TRIGGER IF EXISTS trg_investagon_intern_abtrennen ON public.wohnungen;
CREATE TRIGGER trg_investagon_intern_abtrennen
  BEFORE INSERT OR UPDATE OF meta ON public.wohnungen
  FOR EACH ROW EXECUTE FUNCTION public.investagon_intern_abtrennen();

UPDATE public.objekte o
   SET meta = jsonb_set(o.meta, '{investagonRaw}', (public.investagon_roh_trennen(o.meta -> 'investagonRaw')).oeffentlich)
 WHERE jsonb_typeof(o.meta -> 'investagonRaw') = 'object'
   AND (public.investagon_roh_trennen(o.meta -> 'investagonRaw')).intern <> '{}'::jsonb;

UPDATE public.wohnungen w
   SET meta = jsonb_set(w.meta, '{investagonRaw}', (public.investagon_roh_trennen(w.meta -> 'investagonRaw')).oeffentlich)
 WHERE jsonb_typeof(w.meta -> 'investagonRaw') = 'object'
   AND (public.investagon_roh_trennen(w.meta -> 'investagonRaw')).intern <> '{}'::jsonb;

COMMIT;

-- Zum Schluss: der Stand danach. Erwartet: 0, 0, dann die Zahl der Objekte und
-- Einheiten mit Investagon-Datensatz (Stand 05.10.2026: 97 und 618).
SELECT
  (SELECT count(*) FROM public.objekte
    WHERE meta -> 'investagonRaw' ?| ARRAY['commission','commission_comment','userCommissions','selling_price_commission','selling_price_commission_manual','sellingPriceCommission','transaction_broker_rate','listing_broker']) AS objekte_mit_provision_in_meta,
  (SELECT count(*) FROM public.wohnungen
    WHERE meta -> 'investagonRaw' ?| ARRAY['commission','commission_comment','userCommissions','selling_price_commission','selling_price_commission_manual','sellingPriceCommission','transaction_broker_rate','listing_broker']) AS einheiten_mit_provision_in_meta,
  (SELECT count(*) FROM public.investagon_intern WHERE objekt_id IS NOT NULL) AS objekte_in_investagon_intern,
  (SELECT count(*) FROM public.investagon_intern WHERE wohnung_id IS NOT NULL) AS einheiten_in_investagon_intern;

-- Nachsehen (aendert nichts): Pruefzeilen 88.1 bis 88.4 in
-- supabase/migrations-inbox/99_PRUEFUNG.sql.

-- ===========================================================================
-- Teil: 20261005123000_lotse_auswertung_warteschlange.sql
-- ===========================================================================

-- ===========================================================================
-- MORE Lotse: neue Unterlagen automatisch auswerten (05.10.2026)
-- ===========================================================================
--
-- WARUM
--
-- Der Lotse wertet Unterlagen bisher nur aus, wenn jemand die Einheit oeffnet
-- (hoechstens sechs je Oeffnen). Seit dem 05.10.2026 wertet ein Zeitplan neue
-- Unterlagen einmalig im Voraus aus, sobald der Investagon-Import (oder ein
-- Hochladen) eine Objekt- oder Einheitsunterlage anlegt.
--
-- WAS DIESE MIGRATION TUT
--
--   1. Tabelle lotse_auswertung_warteschlange: je Objekt eine Zeile, solange
--      dort neue Unterlagen warten. Nur die Dienstrolle liest und schreibt,
--      es gibt keine Regel fuer angemeldete Nutzer.
--   2. Ausloeser trg_lotse_auswertung_objekt und trg_lotse_auswertung_einheit
--      nach jedem INSERT in objekt_dokumente beziehungsweise
--      wohnungs_dokumente: Das Objekt kommt in die Schlange. Ein Fehler hier
--      verhindert nie das Anlegen der Unterlage, er wird nur gewarnt.
--   3. Zeitplan lotse-unterlagen-auswerten alle 10 Minuten: ruft objekt-lotse
--      mit x-internal-secret aus public.automatik_geheimnis(). Die Function
--      nimmt hoechstens fuenf Objekte und acht Unterlagen je Lauf und
--      leert die Schlange, wenn ein Objekt fertig ist. Ist die Schlange leer,
--      geschieht nichts und es entstehen keine KI-Kosten.
--
-- Der oeffentliche Schluessel steht nicht in dieser Datei, er wird wie in
-- 20261004195000 aus einem vorhandenen Zeitplan gelesen (nur Rolle anon).
-- Ohne Geheimwort im Tresor oder ohne Schluessel entstehen Tabelle und
-- Ausloeser trotzdem, nur der Zeitplan nicht.
--
-- REIHENFOLGE
--
-- Erst objekt-lotse ausrollen, dann diese Migration. Aendert keine
-- bestehenden Daten, wiederholbar.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.lotse_auswertung_warteschlange (
  objekt_id uuid PRIMARY KEY REFERENCES public.objekte(id) ON DELETE CASCADE,
  eingetragen_am timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lotse_auswertung_warteschlange ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lotse_auswertung_warteschlange FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.lotse_auswertung_eintragen()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _objekt uuid;
BEGIN
  BEGIN
    IF TG_TABLE_NAME = 'objekt_dokumente' THEN
      _objekt := NEW.objekt_id;
    ELSE
      SELECT w.objekt_id INTO _objekt FROM public.wohnungen w WHERE w.id = NEW.wohnung_id;
    END IF;
    IF _objekt IS NOT NULL THEN
      INSERT INTO public.lotse_auswertung_warteschlange (objekt_id, eingetragen_am)
      VALUES (_objekt, now())
      ON CONFLICT (objekt_id) DO UPDATE SET eingetragen_am = now();
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'lotse_auswertung_eintragen: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.lotse_auswertung_eintragen() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_lotse_auswertung_objekt ON public.objekt_dokumente;
CREATE TRIGGER trg_lotse_auswertung_objekt
  AFTER INSERT ON public.objekt_dokumente
  FOR EACH ROW EXECUTE FUNCTION public.lotse_auswertung_eintragen();

DROP TRIGGER IF EXISTS trg_lotse_auswertung_einheit ON public.wohnungs_dokumente;
CREATE TRIGGER trg_lotse_auswertung_einheit
  AFTER INSERT ON public.wohnungs_dokumente
  FOR EACH ROW EXECUTE FUNCTION public.lotse_auswertung_eintragen();

DO $zeitplan$
DECLARE
  _url text := 'https://irwdgutegmivbtgmftyc.supabase.co/functions/v1/objekt-lotse';
  _anon text;
  _kandidat text;
  _teil text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     OR NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    RAISE WARNING 'pg_cron oder pg_net fehlt. Es wurde kein Zeitplan angelegt.';
    RETURN;
  END IF;

  IF public.automatik_geheimnis() = '' THEN
    RAISE WARNING 'Im Tresor liegt kein Geheimwort unter dem Namen AUTOMATIK_GEHEIMWORT. Es wurde KEIN Zeitplan angelegt.';
    RETURN;
  END IF;

  FOR _kandidat IN
    SELECT (regexp_match(command, 'apikey[^e]{1,8}(eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)'))[1]
      FROM cron.job
     ORDER BY jobid
  LOOP
    CONTINUE WHEN _kandidat IS NULL;
    BEGIN
      _teil := translate(split_part(_kandidat, '.', 2), '-_', '+/');
      _teil := rpad(_teil, ((length(_teil) + 3) / 4) * 4, '=');
      IF convert_from(decode(_teil, 'base64'), 'UTF8')::jsonb ->> 'role' = 'anon' THEN
        _anon := _kandidat;
        EXIT;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      CONTINUE;
    END;
  END LOOP;

  IF _anon IS NULL THEN
    RAISE WARNING 'In keinem vorhandenen Zeitplan steht ein oeffentlicher Schluessel (apikey, Rolle anon). Es wurde KEIN Zeitplan angelegt.';
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'lotse-unterlagen-auswerten') THEN
    PERFORM cron.unschedule('lotse-unterlagen-auswerten');
  END IF;

  PERFORM cron.schedule(
    'lotse-unterlagen-auswerten',
    '*/10 * * * *',
    format(
      $befehl$SELECT net.http_post(url := %L, headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', %L, 'Authorization', %L, 'x-internal-secret', public.automatik_geheimnis()), body := '{"aktion":"warteschlange"}'::jsonb, timeout_milliseconds := 150000);$befehl$,
      _url,
      _anon,
      'Bearer ' || _anon
    )
  );
  RAISE NOTICE 'Zeitplan "lotse-unterlagen-auswerten" (objekt-lotse) alle 10 Minuten angelegt.';
END
$zeitplan$;

-- Nachsehen (aendert nichts): Pruefzeilen 87.1 bis 87.3 in
-- supabase/migrations-inbox/99_PRUEFUNG.sql.

-- ===========================================================================
-- Teil: 20261005130000_rv_link_nach_aufheben.sql
-- ===========================================================================

-- ===========================================================================
-- Reservierungslink nach dem Aufheben ungültig
-- ===========================================================================
--
-- Seit dem 05.10.2026 setzt „Reservierung aufheben“ im Kundenprofil am
-- Investment `meta.rvZuletztAufgehobenAm`. Offene Unterschriftslinks der
-- aufgehobenen Vereinbarung kann der Browser aber nicht löschen (seit
-- 20260929200000 nur der Server). Damit sie nicht mehr unterschrieben werden
-- können:
--
--   - `rv_anfrage_aufgehoben`: liegt eine rv-Anfrage vor dem letzten Aufheben?
--     Nicht öffentlich, nur für die beiden Funktionen darunter.
--   - `get_signature_request` markiert eine solche Anfrage als überholt
--     (offene: Status `ueberholt`; beide: `meta.rvUeberholtAm`) und liefert
--     sie mit Status `ueberholt` und `meta.rvAufgehoben = true`. Die
--     Signaturseite zeigt dann „Diese Reservierung wurde aufgehoben, der Link
--     ist nicht mehr gültig.“ Deshalb ist sie jetzt VOLATILE statt STABLE.
--   - `sign_signature_request` nimmt eine solche Anfrage nicht mehr an.
--
-- Alles andere bleibt wortgleich zu 20260925180000 und 20260517145512.
-- Ändert keine Daten beim Ausführen, wiederholbar.

BEGIN;

CREATE OR REPLACE FUNCTION public.rv_anfrage_aufgehoben(_person_type text, _investment_id text, _created_at timestamptz)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _wert text;
  _am timestamptz;
BEGIN
  IF _person_type IS NULL OR _person_type NOT LIKE 'rv\_%' OR _investment_id IS NULL OR _created_at IS NULL THEN
    RETURN false;
  END IF;

  -- investments.id ist uuid, signature_requests.investment_id ist text.
  SELECT i.meta->>'rvZuletztAufgehobenAm'
    INTO _wert
    FROM public.investments i
   WHERE i.id::text = _investment_id;

  IF _wert IS NULL OR btrim(_wert) = '' THEN
    RETURN false;
  END IF;

  BEGIN
    _am := _wert::timestamptz;
  EXCEPTION WHEN others THEN
    RETURN false;
  END;

  RETURN _created_at < _am;
END;
$$;

REVOKE ALL ON FUNCTION public.rv_anfrage_aufgehoben(text, text, timestamptz) FROM public;
REVOKE ALL ON FUNCTION public.rv_anfrage_aufgehoben(text, text, timestamptz) FROM anon, authenticated;

COMMENT ON FUNCTION public.rv_anfrage_aufgehoben(text, text, timestamptz) IS
  'Liegt diese rv-Anfrage vor investments.meta.rvZuletztAufgehobenAm? Nur fuer get_signature_request und sign_signature_request. 05.10.2026.';

CREATE OR REPLACE FUNCTION public.get_signature_request(_token text)
RETURNS public.signature_requests
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _zeile public.signature_requests%ROWTYPE;
  _aufgehoben boolean := false;
BEGIN
  SELECT *
    INTO _zeile
    FROM public.signature_requests
   WHERE token = _token
     AND COALESCE(expires_at > now(), false)
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF public.rv_anfrage_aufgehoben(_zeile.person_type, _zeile.investment_id, _zeile.created_at) THEN
    _aufgehoben := true;
    UPDATE public.signature_requests
       SET status = CASE WHEN status = 'pending' THEN 'ueberholt' ELSE status END,
           meta = COALESCE(meta, '{}'::jsonb) || jsonb_build_object('rvUeberholtAm', now())
     WHERE id = _zeile.id
       AND (status = 'pending' OR NOT (COALESCE(meta, '{}'::jsonb) ? 'rvUeberholtAm'));
    _zeile.status := 'ueberholt';
  END IF;

  _zeile.ip_address := NULL;
  _zeile.user_agent := NULL;
  _zeile.signature_data := NULL;
  _zeile.meta := jsonb_build_object('sprache', public.kontakt_sprache(_zeile.kontakt_id::text))
    || CASE WHEN _aufgehoben THEN jsonb_build_object('rvAufgehoben', true) ELSE '{}'::jsonb END;

  RETURN _zeile;
END;
$$;

COMMENT ON FUNCTION public.get_signature_request(text) IS
  'Oeffentlicher Lesezugriff auf eine Signaturanfrage per Token. Gibt zu abgelaufenen Links nichts heraus und liefert ip_address, user_agent und signature_data immer leer. meta enthaelt nur {"sprache": "de"|"en"} und bei aufgehobener Reservierung {"rvAufgehoben": true}; eine solche rv-Anfrage wird als ueberholt markiert (05.10.2026). Audit-Befund F10 vom 15.09.2026.';

CREATE OR REPLACE FUNCTION public.sign_signature_request(
  _token text,
  _signature_data text,
  _consent_text text,
  _user_agent text DEFAULT NULL
)
RETURNS public.signature_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _row public.signature_requests;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.signature_requests s
     WHERE s.token = _token
       AND public.rv_anfrage_aufgehoben(s.person_type, s.investment_id, s.created_at)
  ) THEN
    RAISE EXCEPTION 'Diese Reservierung wurde aufgehoben, der Link ist nicht mehr gültig.';
  END IF;

  UPDATE public.signature_requests
  SET status = 'signed',
      signed_at = now(),
      signature_data = _signature_data,
      consent_text = _consent_text,
      user_agent = COALESCE(_user_agent, user_agent)
  WHERE token = _token
    AND expires_at > now()
    AND status = 'pending'
  RETURNING * INTO _row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid, expired or already-signed signature request';
  END IF;

  RETURN _row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_signature_request(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sign_signature_request(text, text, text, text) TO anon, authenticated;

COMMIT;

-- Zum Schluss: der Stand danach. Erwartet: true, true.
SELECT
  EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.proname = 'rv_anfrage_aufgehoben') AS pruefung_da,
  EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.proname = 'sign_signature_request'
             AND pg_get_functiondef(p.oid) LIKE '%rv_anfrage_aufgehoben%') AS unterschreiben_geprueft;

-- Nachsehen (aendert nichts): Pruefzeile 87.1 in
-- supabase/migrations-inbox/99_PRUEFUNG.sql.


-- ===========================================================================
-- Teil: 20261005160000_weekly_call_zwei_runden.sql
-- ===========================================================================

-- ===========================================================================
-- Weekly Sales Call: zwei Calls am Montag, Punkte je Call getrennt
-- ===========================================================================
--
-- Vorgabe GL vom 05.10.2026: Montags 19:00 Uhr der Call fuer die
-- Lead-Berater, 19:30 Uhr der Call fuer die Vertriebspartner ohne diese
-- Variante. Admin, Inhaber und Vertriebsleitung betreuen beide. Zoom-Link und
-- Wochenschnitt (20:30, `weekly_call_woche()`) bleiben fuer beide gleich.
--
-- Die Punkte fuer den Call werden je Call getrennt gefuehrt. Die Datenbank
-- erzwingt die Trennung, nicht nur die Oberflaeche:
--
--   - Spalte `weekly_call_punkte.call_runde` ('lead_berater' oder
--     'vertriebspartner'). Bestehende Punkte gehoeren zum 19:00-Call.
--   - `weekly_call_runden(uid)`: welche Calls jemand sieht. Leitung beide,
--     Vertriebspartner mit `profiles.rollen_variante = 'lead_berater'` nur
--     den 19:00-Call, alle anderen Vertriebspartner nur den 19:30-Call,
--     sonst keinen. Gerechnet wird ueber die zugewiesenen Rollen (has_role)
--     und die Variante, die nur Admin und Inhaber setzen (20260927010000).
--   - Lesen, Eintragen, Aendern und Loeschen der eigenen Zeilen nur in einem
--     Call, den man sieht. `call_runde` ist nach dem Anlegen fest.
--   - Lesen (`weekly_call_punkte_lesen`) und Rueckschau
--     (`weekly_call_termine`) nur fuer die eigenen Calls, optional auf einen
--     Call beschraenkt. Beide Funktionen bekommen dafuer einen zweiten,
--     optionalen Parameter `_runde`; ohne ihn gibt es alle eigenen Calls.
--     Die alte Fassung mit einem Parameter wird dafuer entfernt, sonst waere
--     der Aufruf mehrdeutig.
--
-- Unveraendert: Anonymitaet (keine Verfasser-ID nach aussen), Aendern und
-- Loeschen nur am eigenen Punkt und nur bis zum Call, Abhaken nur die
-- Aufsicht, Protokolle und Anhaenge haengen weiter am Termin (gemeinsam fuer
-- beide Calls).
--
-- Ein noch offener alter Browser-Tab traegt ohne `call_runde` ein. Dann setzt
-- der Standardwert den Call des Nutzers selbst, damit nichts im falschen Call
-- landet.
--
-- Wiederholbar. Aendert keine bestehenden Daten ausser dem Fuellen der neuen
-- Spalte mit 'lead_berater'.

BEGIN;

-- ── Welche Calls jemand sieht ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.weekly_call_runden(_uid uuid)
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT CASE
    WHEN _uid IS NULL THEN ARRAY[]::text[]
    -- Im Browser nur fuer sich selbst, sonst liesse sich ueber fremde
    -- Kennungen die Rolle anderer Nutzer erfragen. Der Server (ohne
    -- Anmeldung) darf jede Kennung pruefen.
    WHEN auth.uid() IS NOT NULL AND _uid <> auth.uid() THEN ARRAY[]::text[]
    WHEN public.has_role(_uid, 'admin'::public.app_role)
      OR public.has_role(_uid, 'inhaber'::public.app_role)
      OR public.has_role(_uid, 'vertriebsleiter'::public.app_role)
      THEN ARRAY['lead_berater', 'vertriebspartner']
    WHEN public.has_role(_uid, 'vertriebspartner'::public.app_role) THEN
      CASE WHEN EXISTS (SELECT 1 FROM public.profiles
                         WHERE id = _uid AND rollen_variante = 'lead_berater')
           THEN ARRAY['lead_berater']
           ELSE ARRAY['vertriebspartner'] END
    ELSE ARRAY[]::text[]
  END;
$$;

COMMENT ON FUNCTION public.weekly_call_runden(uuid) IS
  'Weekly Sales Calls, die ein Nutzer sieht: lead_berater (19:00) und/oder '
  'vertriebspartner (19:30). Leitung beide, Lead-Berater nur 19:00, '
  'Vertriebspartner nur 19:30. Gleiche Regel wie callRundenFuer() in '
  'src/lib/weeklyCallZeit.ts. Migration 20261005160000.';

REVOKE EXECUTE ON FUNCTION public.weekly_call_runden(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.weekly_call_runden(uuid) TO authenticated, service_role;

-- Standard beim Eintragen ohne Angabe: der eigene Call, bei der Leitung der
-- erste (19:00).
CREATE OR REPLACE FUNCTION public.weekly_call_eigene_runde()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT COALESCE((public.weekly_call_runden(auth.uid()))[1], 'lead_berater');
$$;

REVOKE EXECUTE ON FUNCTION public.weekly_call_eigene_runde() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.weekly_call_eigene_runde() TO authenticated, service_role;

-- ── Die Spalte ──────────────────────────────────────────────────────────────
-- Erst mit festem Standard anlegen, damit der Bestand sicher beim 19:00-Call
-- landet, danach auf den eigenen Call des Eintragenden umstellen.
ALTER TABLE public.weekly_call_punkte
  ADD COLUMN IF NOT EXISTS call_runde text NOT NULL DEFAULT 'lead_berater';

ALTER TABLE public.weekly_call_punkte
  DROP CONSTRAINT IF EXISTS weekly_call_punkte_call_runde_check;
ALTER TABLE public.weekly_call_punkte
  ADD CONSTRAINT weekly_call_punkte_call_runde_check
  CHECK (call_runde IN ('lead_berater', 'vertriebspartner'));

ALTER TABLE public.weekly_call_punkte
  ALTER COLUMN call_runde SET DEFAULT public.weekly_call_eigene_runde();

CREATE INDEX IF NOT EXISTS idx_wcp_termin_runde
  ON public.weekly_call_punkte (call_termin DESC, call_runde);

COMMENT ON COLUMN public.weekly_call_punkte.call_runde IS
  'Zu welchem Call der Punkt gehoert: lead_berater (19:00) oder '
  'vertriebspartner (19:30). Migration 20261005160000.';

-- ── Lesen, Eintragen, Aendern, Loeschen nur im eigenen Call ─────────────────
--
-- Auch die eigenen Zeilen nur, solange man den Call sieht. Sonst koennte ein
-- Vertriebspartner seine Bestandspunkte (jetzt 19:00) weiter direkt lesen
-- oder loeschen.
DROP POLICY IF EXISTS "wcp_select_eigene" ON public.weekly_call_punkte;
CREATE POLICY "wcp_select_eigene" ON public.weekly_call_punkte
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    AND call_runde = ANY (public.weekly_call_runden(auth.uid()))
  );

DROP POLICY IF EXISTS "wcp_delete_eigene" ON public.weekly_call_punkte;
CREATE POLICY "wcp_delete_eigene" ON public.weekly_call_punkte
  FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    AND call_termin = public.weekly_call_woche()
    AND call_runde = ANY (public.weekly_call_runden(auth.uid()))
  );

DROP POLICY IF EXISTS "wcp_insert" ON public.weekly_call_punkte;
CREATE POLICY "wcp_insert" ON public.weekly_call_punkte
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND call_termin = public.weekly_call_woche()
    AND call_runde = ANY (public.weekly_call_runden(auth.uid()))
  );

DROP POLICY IF EXISTS "wcp_update_eigene" ON public.weekly_call_punkte;
CREATE POLICY "wcp_update_eigene" ON public.weekly_call_punkte
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    AND call_termin = public.weekly_call_woche()
    AND call_runde = ANY (public.weekly_call_runden(auth.uid()))
  )
  WITH CHECK (
    user_id = auth.uid()
    AND call_termin = public.weekly_call_woche()
    AND call_runde = ANY (public.weekly_call_runden(auth.uid()))
  );

-- Ein Punkt bleibt in dem Call, fuer den er eingetragen wurde. Aus dem
-- Browser laesst sich call_runde nach dem Anlegen nicht mehr aendern, auch
-- nicht von der Leitung; nur der Server (ohne Anmeldung) darf es.
CREATE OR REPLACE FUNCTION public.weekly_call_runde_fest()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
BEGIN
  IF NEW.call_runde IS DISTINCT FROM OLD.call_runde AND auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'Ein Punkt bleibt in seinem Call.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_wcp_runde_fest ON public.weekly_call_punkte;
CREATE TRIGGER trg_wcp_runde_fest
  BEFORE UPDATE OF call_runde ON public.weekly_call_punkte
  FOR EACH ROW EXECUTE FUNCTION public.weekly_call_runde_fest();

-- ── Lesen nur die eigenen Calls ─────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.weekly_call_punkte_lesen(date);
DROP FUNCTION IF EXISTS public.weekly_call_punkte_lesen(date, text);
CREATE FUNCTION public.weekly_call_punkte_lesen(_termin date DEFAULT NULL, _runde text DEFAULT NULL)
RETURNS TABLE (
  id uuid,
  text text,
  call_termin date,
  call_runde text,
  von_mir boolean,
  besprochen boolean,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT p.id,
         p.text,
         p.call_termin,
         p.call_runde,
         p.user_id = auth.uid() AS von_mir,
         p.besprochen_am IS NOT NULL AS besprochen,
         p.created_at
    FROM public.weekly_call_punkte p
   WHERE p.call_termin = COALESCE(_termin, public.weekly_call_woche())
     AND p.call_runde = ANY (public.weekly_call_runden(auth.uid()))
     AND (_runde IS NULL OR p.call_runde = _runde)
   ORDER BY p.created_at ASC;
$$;

COMMENT ON FUNCTION public.weekly_call_punkte_lesen(date, text) IS
  'Punkte eines Weekly Sales Call ohne Verfasser, nur aus den Calls, die der '
  'Nutzer sieht (weekly_call_runden). _runde beschraenkt auf einen Call. '
  'Migration 20261005160000.';

REVOKE EXECUTE ON FUNCTION public.weekly_call_punkte_lesen(date, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.weekly_call_punkte_lesen(date, text) TO authenticated;

-- Rueckschau: Termine mit Punkten aus den eigenen Calls oder mit Protokoll.
DROP FUNCTION IF EXISTS public.weekly_call_termine();
DROP FUNCTION IF EXISTS public.weekly_call_termine(text);
CREATE FUNCTION public.weekly_call_termine(_runde text DEFAULT NULL)
RETURNS TABLE (call_termin date, anzahl bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  WITH sichtbar AS (
    SELECT p.id, p.call_termin
      FROM public.weekly_call_punkte p
     WHERE p.call_runde = ANY (public.weekly_call_runden(auth.uid()))
       AND (_runde IS NULL OR p.call_runde = _runde)
  )
  SELECT t.call_termin, count(s.id) AS anzahl
    FROM (
      SELECT call_termin FROM sichtbar
      UNION
      SELECT call_termin FROM public.weekly_call_protokolle
    ) t
    LEFT JOIN sichtbar s ON s.call_termin = t.call_termin
   WHERE cardinality(public.weekly_call_runden(auth.uid())) > 0
   GROUP BY t.call_termin
   ORDER BY t.call_termin DESC;
$$;

REVOKE EXECUTE ON FUNCTION public.weekly_call_termine(text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.weekly_call_termine(text) TO authenticated;

COMMIT;

-- Zum Schluss: der Stand danach. Erwartet: true, 4, true, 0.
SELECT
  EXISTS (SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'weekly_call_punkte'
             AND column_name = 'call_runde') AS spalte_da,
  (SELECT count(*) FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'weekly_call_punkte'
      AND COALESCE(qual, with_check) LIKE '%weekly_call_runden%') AS regeln_getrennt,
  EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.proname = 'weekly_call_punkte_lesen'
             AND pg_get_function_identity_arguments(p.oid) = '_termin date, _runde text') AS lesen_getrennt,
  (SELECT count(*) FROM public.weekly_call_punkte WHERE call_runde IS NULL) AS punkte_ohne_call;

-- Nachsehen (aendert nichts): Pruefzeilen 90.1 bis 90.3 in
-- supabase/migrations-inbox/99_PRUEFUNG.sql.


-- ===========================================================================
-- Teil: 20261007100000_sa_fester_link.sql
-- ===========================================================================

-- ===========================================================================
-- Selbstauskunft: ein fester Link je Investment und Person
-- ===========================================================================
--
-- WARUM
--
-- Kunden oeffnen Links aus aelteren Mails (Einladung, Erinnerung). Jeder
-- Versand erzeugte einen neuen Link, jeder lief nach sieben Tagen ab, und der
-- naechtliche Lauf `cleanup_expired_tokens()` loeschte ihn sieben Tage
-- spaeter. Die Seite sagte dann "Ungueltiger Link", obwohl der Kunde laengst
-- einen neueren, gueltigen Link fuer dasselbe Investment hatte.
--
-- Freigabe der Geschaeftsfuehrung vom 07.10.2026: ein fester Link je
-- Kontakt, Investment und Person, 30 Tage gueltig ab der letzten Aktivitaet.
--
-- WAS DIESE MIGRATION TUT
--
-- 1. Bestand: Jeder offene, noch gueltige Link (`pending`, nicht abgelaufen)
--    gilt mindestens bis heute plus 30 Tage, damit laufende Kunden nicht
--    heute ablaufen. Bereits abgelaufene bleiben abgelaufen; ein Neuversand
--    durch den Berater macht sie wieder gueltig. Eine Wiederholung setzt nur
--    Links, die weniger als 30 Tage Rest haben, wieder auf 30 Tage; laengere
--    bleiben, wie sie sind.
--
-- 2. Ausstellen: `sa_link_ausstellen` (nur fuer `send-sa-invitation`, nicht
--    fuer Besucher oder angemeldete Nutzer). In einer Transaktion und unter
--    einer Sperre je Kontakt, Investment und Person:
--      - offene Links an eine ANDERE Adresse werden widerrufen (Status
--        `widerrufen`): Ging der erste Link an eine vertippte oder fremde
--        Adresse, darf deren Empfaenger nicht weiterarbeiten;
--      - der neueste offene Link an DIESELBE Adresse wird wiederverwendet und
--        gilt wieder 30 Tage, auch wenn er schon abgelaufen war; seine Kopie
--        bleibt, nur eine leere bekommt die neue Vorbelegung;
--      - sonst entsteht ein neuer Link.
--    Handbuch-Links (`nur_am_link`) werden nie wiederverwendet, ihr Stand
--    geht erst beim Abschicken ans Investment.
--
-- 3. Gueltigkeit nach Aktivitaet: Oeffnen (`mark_sa_link_opened`) und
--    Speichern (`update_sa_fill_token_data`) setzen den Ablauf auf mindestens
--    jetzt plus 30 Tage, Versand und Erinnerung ebenso. Nur ein offener, noch
--    gueltiger Link wird verlaengert; ein abgelaufener wird durch Oeffnen
--    nicht wieder lebendig. `greatest` verkuerzt nie einen laengeren Ablauf.
--
-- 4. Immer der aktuelle Stand: `get_sa_fill_token` gibt bei offenem Link den
--    Stand am Investment heraus (`investments.meta.saData`), die Kopie am
--    Link ist Rueckfall. Gelesen wird nur das Investment dieses Links und nur,
--    wenn es zum Kontakt des Links gehoert.
--
-- 5. Person 2: Ein Link fuer Person 2 sieht und schreibt nur `person2Data`.
--    Die Angaben von Person 1 (Einkommen, Steuer-ID, Bankverbindung) bekommt
--    er nicht heraus, und sein Speichern ersetzt nicht mehr `saData`, sondern
--    traegt nur `person2Data` in den vorhandenen Stand ein. Der Link fuer
--    Person 1 sieht weiter alles: Die Selbstauskunft ist ein gemeinsamer
--    Antrag, Person 1 fuellt die Angaben von Person 2 mit aus. Derzeit legt
--    kein Weg im CRM einen Link fuer Person 2 an; der Filter sichert alte
--    Zeilen und jeden kuenftigen Weg ab.
--
-- 6. Schreiben nur, was zusammengehoert: `update_sa_fill_token_data` sperrt
--    die Zeile (FOR UPDATE) und prueft Status und Ablauf unter der Sperre. Die
--    Abschlusswege setzen `used` mit einem UPDATE auf dieselbe Zeile und
--    warten damit auf die Sperre; danach sieht jeder weitere Speicherversuch
--    `used` und schreibt nichts. Ausserdem muss das Investment zum Kontakt
--    des Links gehoeren, sonst wird nichts geschrieben.
--
-- 7. Aufraeumen nur abgeschlossener Links. Entscheidung vom 07.10.2026: Bei
--    einer noch nicht abgeschlossenen Selbstauskunft (`pending`) wird nie
--    etwas geleert oder geloescht, auch nicht nach Ablauf. Ein
--    abgeschlossener Link (`used`) verliert 30 Tage nach dem Abschluss seine
--    Kopie (gespeicherter Stand, E-Mail, Name, die drei Zeitpunkte zu Mail,
--    Link und Erinnerung). Datenminimierung: Nach dem Abschluss liegen die
--    Angaben am Investment und im unterschriebenen PDF, die Kopie am Link
--    braucht niemand mehr. Es bleiben nur Kennungen, damit die Seite weiter
--    "Bereits ausgefuellt" sagt statt "unbekannt". 180 Tage nach Ablauf wird
--    ein abgeschlossener Link geloescht, wie bei `signature_requests`. Der
--    Abschluss wird an `updated_at` gemessen, das beim Setzen auf `used`
--    mitlaeuft (Trigger aus 20260623050816). Widerrufene Links bleiben
--    stehen wie offene; ihr Stand gehoert zu einem nicht abgeschlossenen
--    Vorgang.
--
-- 8. `sa_link_nachfolger(_token)`: Der Token des neuesten offenen und
--    gueltigen Links fuer denselben Kontakt, dasselbe Investment, dieselbe
--    Person und dieselbe Adresse, wenn der aufgerufene Link offen und aelter
--    ist; sonst NULL. Abgeschlossene und widerrufene Links haben keinen
--    Nachfolger. Ein gueltiger Handbuch-Link bleibt, sein Stand liegt an ihm.
--    Wer den alten Link hat, hatte Zugriff auf genau dieses Postfach; gleiche
--    Adresse heisst derselbe Empfaenger. Die Funktion gibt nur den Token
--    heraus.
--
-- 9. `sa_neuen_link_anfordern(_token)`: Knopf "Neuen Link anfordern" auf der
--    Seite eines abgelaufenen Links. Eine Glocke an den aktuell Zustaendigen
--    des Kontakts, ohne Zustaendigen an Admin, Inhaber und Vertriebsleitung
--    (Glocken-Regel vom 28.09.2026). Hoechstens einmal in 24 Stunden je
--    Kontakt und Investment, egal ueber welchen alten Link, unter einer
--    Sperre gegen gleichzeitige Klicks. Antwort: 'angefordert',
--    'schon_angefordert' oder 'nicht_moeglich'.
--
-- 10. `sa_link_abschliessen` (nur fuer `submit-sa-signature`): Abschicken
--    unter der Sperre des Links in einer Transaktion. Prueft Status, Ablauf,
--    Kontaktzuordnung und dass jede Unterschrift zur Person des Links passt
--    (Link fuer Person 2 nur `person2`), legt die Unterschriften an (je
--    Fassung und Person hoechstens eine), traegt den Stand gegen den Stand
--    am Investment in genau diesem Augenblick ein (Person 2 nur
--    `person2Data`) und setzt den Link nur von `pending` auf `used`. Ein
--    widerrufener Link wird nie `used`. Ein zweiter Aufruf nach einem
--    Netzaussetzer bekommt 'schon_abgeschlossen' und schreibt nichts.
--    Neue Spalten: `abgeschlossen_am` (danach darf der Link nur noch zwei
--    Stunden lang Angaben und Unterschriften seiner eigenen Fassung abholen,
--    `finalize-selbstauskunft`) und `p2_nachforderung_am` (die Mail an
--    Person 2 ging hinaus; leer heisst, ein Wiederholungsaufruf holt sie
--    nach).
--
-- Status: `pending` offen, `used` abgeschlossen, neu `widerrufen`. Alles, was
-- nicht `pending` ist, gilt in allen Funktionen als geschlossen: keine Daten,
-- keine Verlaengerung, kein Nachfolger.
--
-- Alle Funktionen laufen als SECURITY DEFINER mit `search_path = public,
-- pg_temp`; erst wird PUBLIC alles entzogen, dann bekommen nur die noetigen
-- Rollen das Aufrufrecht.
--
-- REIHENFOLGE
--
-- Nach 20261004130000_absicherung_lesen.sql: `cleanup_expired_tokens()` ist
-- hier deren Fassung (Scan-Sitzungen bleiben stehen), nur der Teil zu
-- `sa_fill_tokens` ist neu. Liefe 20261004130000 danach, loeschte der Lauf
-- wieder offene Links sieben Tage nach Ablauf. Danach `send-sa-invitation`,
-- `send-sa-abbrecher-reminder`, `submit-sa-signature` und
-- `finalize-selbstauskunft` ausrollen.
--
-- Ohne diese Migration: Die Seite zeigt fuer geloeschte Links "Dieser Link
-- ist nicht bekannt", bietet weder Weiterleitung noch Knopf an und liest die
-- Kopie am Link; `send-sa-invitation` legt wie bisher je Versand einen neuen
-- Link an, der 30 Tage gilt.
-- ===========================================================================

BEGIN;

ALTER TABLE public.sa_fill_tokens
  ADD COLUMN IF NOT EXISTS neuer_link_angefordert_am timestamptz,
  ADD COLUMN IF NOT EXISTS abgeschlossen_am timestamptz,
  ADD COLUMN IF NOT EXISTS p2_nachforderung_am timestamptz;

COMMENT ON COLUMN public.sa_fill_tokens.abgeschlossen_am IS
  'Wann dieser Link ueber sa_link_abschliessen abgeschickt wurde. finalize-selbstauskunft laesst ihn danach nur zwei Stunden lang Angaben abholen. Migration 20261007100000.';
COMMENT ON COLUMN public.sa_fill_tokens.p2_nachforderung_am IS
  'Wann die Mail an Person 2 zu dieser Fassung erfolgreich versendet wurde (submit-sa-signature). Leer heisst: beim naechsten Aufruf nachholen. Migration 20261007100000.';

COMMENT ON COLUMN public.sa_fill_tokens.neuer_link_angefordert_am IS
  'Wann der Kunde auf der Seite des abgelaufenen Links einen neuen angefordert hat (sa_neuen_link_anfordern). Migration 20261007100000.';

-- ---------------------------------------------------------------------------
-- 1) Bestand: offene Links mindestens 30 Tage
-- ---------------------------------------------------------------------------

UPDATE public.sa_fill_tokens
   SET expires_at = now() + interval '30 days'
 WHERE status = 'pending'
   AND expires_at > now()
   AND expires_at < now() + interval '30 days';

-- ---------------------------------------------------------------------------
-- 2) Helfer: was ein Link fuer Person 2 sehen und schreiben darf
-- ---------------------------------------------------------------------------

-- Lesen: Person 1 alles, Person 2 nur ihr eigener Teil.
CREATE OR REPLACE FUNCTION public.sa_daten_sicht(_person_nr integer, _daten jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN _daten IS NULL OR jsonb_typeof(_daten) <> 'object' THEN NULL
    WHEN _person_nr = 2 THEN jsonb_build_object(
      'person2', true,
      'person2Data', CASE WHEN jsonb_typeof(_daten -> 'person2Data') = 'object' THEN _daten -> 'person2Data' ELSE '{}'::jsonb END)
    ELSE _daten
  END
$$;

-- Schreiben: Person 1 ersetzt den Stand, Person 2 traegt nur ihren Teil ein.
CREATE OR REPLACE FUNCTION public.sa_daten_fuer_person(_person_nr integer, _eingabe jsonb, _bestand jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN _person_nr = 2 THEN
      (CASE WHEN jsonb_typeof(_bestand) = 'object' THEN _bestand ELSE '{}'::jsonb END)
      || jsonb_build_object(
           'person2', true,
           'person2Data', CASE WHEN jsonb_typeof(_eingabe -> 'person2Data') = 'object' THEN _eingabe -> 'person2Data' ELSE '{}'::jsonb END)
    ELSE _eingabe
  END
$$;

-- Kennung als uuid, oder NULL, wenn sie keine ist. So trifft der Vergleich
-- den Index auf investments.id, und eine kaputte Kennung bricht nichts ab.
CREATE OR REPLACE FUNCTION public.sa_als_uuid(_text text)
RETURNS uuid
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN _text::uuid;
EXCEPTION WHEN invalid_text_representation THEN
  RETURN NULL;
END;
$$;

-- Darf ein Link dieser Person diese Unterschrift einreichen? Person 2 nur
-- die eigene, Person 1 wie bisher (sie unterschreibt im selben Fenster auch
-- fuer Person 2).
CREATE OR REPLACE FUNCTION public.sa_signatur_passt(_person_nr integer, _person_type text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE WHEN _person_nr = 2 THEN lower(btrim(coalesce(_person_type, ''))) = 'person2' ELSE true END
$$;

REVOKE ALL ON FUNCTION public.sa_signatur_passt(integer, text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.sa_als_uuid(text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.sa_daten_sicht(integer, jsonb) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.sa_daten_fuer_person(integer, jsonb, jsonb) FROM public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3) Ausstellen: ein fester Link je Kontakt, Investment und Person
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sa_link_ausstellen(
  _kontakt_id text,
  _investment_id text,
  _person_nr integer,
  _email text,
  _name text,
  _created_by uuid,
  _prefill jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _vorhanden public.sa_fill_tokens%ROWTYPE;
  _widerrufen int := 0;
  _token text;
  _kopie jsonb := public.sa_daten_sicht(_person_nr, _prefill);
BEGIN
  IF coalesce(btrim(_kontakt_id), '') = '' OR coalesce(btrim(_investment_id), '') = ''
     OR _person_nr NOT IN (1, 2) OR coalesce(btrim(_email), '') = '' THEN
    RAISE EXCEPTION 'sa_link_ausstellen: Kontakt, Investment, Person (1 oder 2) und E-Mail sind Pflicht'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Zwei Versaende gleichzeitig duerfen nicht zwei Links anlegen.
  PERFORM pg_advisory_xact_lock(hashtext('sa_link:' || _kontakt_id || ':' || _investment_id || ':' || _person_nr));

  UPDATE public.sa_fill_tokens
     SET status = 'widerrufen'
   WHERE kontakt_id = _kontakt_id
     AND investment_id = _investment_id
     AND person_nr = _person_nr
     AND status = 'pending'
     AND lower(btrim(email)) <> lower(btrim(_email));
  GET DIAGNOSTICS _widerrufen = ROW_COUNT;

  SELECT * INTO _vorhanden
    FROM public.sa_fill_tokens
   WHERE kontakt_id = _kontakt_id
     AND investment_id = _investment_id
     AND person_nr = _person_nr
     AND status = 'pending'
     AND NOT coalesce(nur_am_link, false)
     AND lower(btrim(email)) = lower(btrim(_email))
   ORDER BY created_at DESC
   LIMIT 1
   FOR UPDATE;

  IF FOUND THEN
    UPDATE public.sa_fill_tokens
       SET name = coalesce(nullif(btrim(_name), ''), name),
           expires_at = greatest(expires_at, now() + interval '30 days'),
           reminder_sent_at = NULL,
           prefill_data = CASE
             WHEN prefill_data IS NULL OR prefill_data = '{}'::jsonb THEN _kopie
             ELSE prefill_data END
     WHERE id = _vorhanden.id;
    RETURN jsonb_build_object('token', _vorhanden.token, 'wiederverwendet', true, 'widerrufen', _widerrufen);
  END IF;

  INSERT INTO public.sa_fill_tokens (kontakt_id, investment_id, person_nr, email, name, created_by, prefill_data, expires_at)
  VALUES (_kontakt_id, _investment_id, _person_nr, btrim(_email), coalesce(_name, ''), _created_by,
          coalesce(_kopie, '{}'::jsonb), now() + interval '30 days')
  RETURNING token INTO _token;

  RETURN jsonb_build_object('token', _token, 'wiederverwendet', false, 'widerrufen', _widerrufen);
END;
$$;

REVOKE ALL ON FUNCTION public.sa_link_ausstellen(text, text, integer, text, text, uuid, jsonb) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sa_link_ausstellen(text, text, integer, text, text, uuid, jsonb) TO service_role;

COMMENT ON FUNCTION public.sa_link_ausstellen(text, text, integer, text, text, uuid, jsonb) IS
  'Fester Selbstauskunfts-Link: andere Adresse widerrufen, gleiche Adresse wiederverwenden und 30 Tage verlaengern, sonst neu. Nur send-sa-invitation (service_role). Migration 20261007100000.';

-- ---------------------------------------------------------------------------
-- 4) Aufraeumen: offene Links nie, abgeschlossene nach 30 und 180 Tagen
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.cleanup_expired_tokens()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_activation int := 0;
  v_sa int := 0;
  v_sa_geleert int := 0;
  v_unsub int := 0;
  v_sig int := 0;
BEGIN
  DELETE FROM public.activation_tokens
   WHERE (expires_at IS NOT NULL AND expires_at < now() - interval '7 days')
      OR (used_at   IS NOT NULL AND used_at   < now() - interval '30 days');
  GET DIAGNOSTICS v_activation = ROW_COUNT;

  -- Selbstauskunfts-Links: nur abgeschlossene (`used`). Offene bleiben ganz,
  -- auch nach Ablauf (Kopf Punkt 7). Geleert wird nur, was noch etwas
  -- traegt, damit der Lauf nicht jede Nacht dieselben Zeilen anfasst.
  UPDATE public.sa_fill_tokens
     SET prefill_data     = NULL,
         email            = '',
         name             = '',
         email_opened_at  = NULL,
         link_opened_at   = NULL,
         reminder_sent_at = NULL
   WHERE status = 'used'
     AND updated_at < now() - interval '30 days'
     AND (prefill_data IS NOT NULL OR email <> '' OR name <> ''
          OR email_opened_at IS NOT NULL OR link_opened_at IS NOT NULL OR reminder_sent_at IS NOT NULL);
  GET DIAGNOSTICS v_sa_geleert = ROW_COUNT;

  DELETE FROM public.sa_fill_tokens
   WHERE status = 'used'
     AND expires_at IS NOT NULL AND expires_at < now() - interval '180 days';
  GET DIAGNOSTICS v_sa = ROW_COUNT;

  DELETE FROM public.email_unsubscribe_tokens
   WHERE used_at IS NOT NULL AND used_at < now() - interval '90 days';
  GET DIAGNOSTICS v_unsub = ROW_COUNT;

  -- mobile_scan_sessions bleiben stehen, siehe 20261004130000 Kopf Punkt 4.

  DELETE FROM public.signature_requests
   WHERE expires_at IS NOT NULL AND expires_at < now() - interval '180 days';
  GET DIAGNOSTICS v_sig = ROW_COUNT;

  RETURN jsonb_build_object(
    'activation_tokens', v_activation,
    'sa_fill_tokens', v_sa,
    'sa_fill_tokens_geleert', v_sa_geleert,
    'email_unsubscribe_tokens', v_unsub,
    'mobile_scan_sessions', 0,
    'signature_requests', v_sig,
    'ran_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_expired_tokens() FROM public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5) Link lesen: der Stand kommt vom Investment, Person 2 nur ihr Teil
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_sa_fill_token(_token text)
RETURNS public.sa_fill_tokens
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _zeile public.sa_fill_tokens%ROWTYPE;
  _stand jsonb;
BEGIN
  SELECT *
    INTO _zeile
    FROM public.sa_fill_tokens
   WHERE token = _token
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  _zeile.sprache := CASE
    WHEN lower(btrim(coalesce(_zeile.sprache, ''))) IN ('de', 'en') THEN lower(btrim(_zeile.sprache))
    ELSE public.kontakt_sprache(_zeile.kontakt_id)
  END;

  -- Abgeschickt, widerrufen oder abgelaufen: nur Status, Ablauf und Sprache (seit 20260928220000).
  IF NOT coalesce(_zeile.status = 'pending' AND _zeile.expires_at > now(), false) THEN
    _zeile.prefill_data := NULL;
    _zeile.email := '';
    _zeile.name := '';
    _zeile.kontakt_id := NULL;
    _zeile.investment_id := NULL;
    _zeile.created_by := NULL;
    _zeile.email_opened_at := NULL;
    _zeile.link_opened_at := NULL;
    _zeile.reminder_sent_at := NULL;
    RETURN _zeile;
  END IF;

  IF NOT coalesce(_zeile.nur_am_link, false) THEN
    -- Offen: der Stand am Investment geht vor der Kopie am Link (Kopf Punkt 4).
    -- Nur das Investment dieses Links, und nur, wenn es zum Kontakt gehoert.
    SELECT i.meta -> 'saData'
      INTO _stand
      FROM public.investments i
     WHERE i.id = public.sa_als_uuid(_zeile.investment_id)
       AND i.kunde_id = public.sa_als_uuid(_zeile.kontakt_id)
     LIMIT 1;
    IF jsonb_typeof(_stand) = 'object' AND _stand <> '{}'::jsonb THEN
      _zeile.prefill_data := _stand;
    END IF;
  END IF;

  -- Person 2 bekommt nur ihren eigenen Teil heraus, auch aus der Kopie (Kopf Punkt 5).
  _zeile.prefill_data := public.sa_daten_sicht(_zeile.person_nr, _zeile.prefill_data);

  RETURN _zeile;
END;
$$;

REVOKE ALL ON FUNCTION public.get_sa_fill_token(text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_sa_fill_token(text) TO anon, authenticated;

COMMENT ON FUNCTION public.get_sa_fill_token(text) IS
  'Selbstauskunfts-Link lesen: bei offenem Link der Stand am Investment (sonst die Kopie am Link), fuer Person 2 nur person2Data; sonst nur Status, Ablauf und Sprache. Migrationen 20260928220000 und 20261007100000.';

-- ---------------------------------------------------------------------------
-- 6) Oeffnen und Speichern verlaengern den Link
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.mark_sa_link_opened(_token text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE public.sa_fill_tokens
     SET link_opened_at  = COALESCE(link_opened_at, now()),
         email_opened_at = COALESCE(email_opened_at, now()),
         expires_at      = greatest(expires_at, now() + interval '30 days')
   WHERE token = _token
     AND status = 'pending'
     AND expires_at > now();
$$;

REVOKE ALL ON FUNCTION public.mark_sa_link_opened(text) FROM public;
GRANT EXECUTE ON FUNCTION public.mark_sa_link_opened(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.update_sa_fill_token_data(_token text, _data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_token_row public.sa_fill_tokens%ROWTYPE;
BEGIN
  -- Unter der Sperre pruefen: Ein Abschluss (`used`) wartet auf sie, und
  -- danach schreibt kein Speicherversuch mehr (Kopf Punkt 6).
  SELECT * INTO v_token_row FROM public.sa_fill_tokens WHERE token = _token FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found');
  END IF;
  IF v_token_row.status <> 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_pending');
  END IF;
  IF v_token_row.expires_at < now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'expired');
  END IF;

  -- Das Investment muss zum Kontakt des Links gehoeren, wie beim Lesen.
  IF NOT EXISTS (
    SELECT 1 FROM public.investments i
     WHERE i.id = public.sa_als_uuid(v_token_row.investment_id)
       AND i.kunde_id = public.sa_als_uuid(v_token_row.kontakt_id)
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'zuordnung');
  END IF;

  -- Speichern ist Aktivitaet: der Link gilt wieder 30 Tage (20261007100000).
  -- Die Kopie am Link traegt fuer Person 2 nur deren Teil.
  UPDATE public.sa_fill_tokens
     SET prefill_data = public.sa_daten_sicht(v_token_row.person_nr, _data),
         expires_at = greatest(expires_at, now() + interval '30 days'),
         updated_at = now()
   WHERE id = v_token_row.id;

  IF NOT v_token_row.nur_am_link THEN
    -- Person 1 ersetzt den Stand, Person 2 traegt nur person2Data ein.
    UPDATE public.investments
       SET meta = COALESCE(meta, '{}'::jsonb) || jsonb_build_object(
             'saData', public.sa_daten_fuer_person(v_token_row.person_nr, _data, meta -> 'saData')),
           updated_at = now()
     WHERE id = public.sa_als_uuid(v_token_row.investment_id)
       AND COALESCE((meta->>'abgeschlossen')::boolean, false) = false;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.update_sa_fill_token_data(text, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.update_sa_fill_token_data(text, jsonb) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7) Nachfolger: alte Links leiten auf den festen Link weiter
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sa_link_nachfolger(_token text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _alt public.sa_fill_tokens%ROWTYPE;
  _neu text;
BEGIN
  SELECT * INTO _alt FROM public.sa_fill_tokens WHERE token = _token LIMIT 1;
  IF NOT FOUND OR _alt.status <> 'pending' THEN
    -- Unbekannt, abgeschlossen oder widerrufen: nichts weiterzuleiten.
    RETURN NULL;
  END IF;

  -- Ein gueltiger Handbuch-Link traegt seinen Stand selbst, er bleibt.
  IF coalesce(_alt.nur_am_link, false) AND coalesce(_alt.expires_at > now(), false) THEN
    RETURN NULL;
  END IF;

  -- Ohne Adresse am alten Link laesst sich der Empfaenger nicht vergleichen.
  IF btrim(coalesce(_alt.email, '')) = '' THEN
    RETURN NULL;
  END IF;

  SELECT n.token INTO _neu
    FROM public.sa_fill_tokens n
   WHERE n.kontakt_id = _alt.kontakt_id
     AND n.investment_id = _alt.investment_id
     AND n.person_nr = _alt.person_nr
     AND lower(btrim(n.email)) = lower(btrim(_alt.email))
     AND n.token <> _alt.token
     AND n.created_at > _alt.created_at
     AND n.status = 'pending'
     AND n.expires_at > now()
   ORDER BY n.created_at DESC
   LIMIT 1;

  RETURN _neu;
END;
$$;

REVOKE ALL ON FUNCTION public.sa_link_nachfolger(text) FROM public;
GRANT EXECUTE ON FUNCTION public.sa_link_nachfolger(text) TO anon, authenticated;

COMMENT ON FUNCTION public.sa_link_nachfolger(text) IS
  'Selbstauskunfts-Link: Token des neueren offenen Links fuer denselben Kontakt, dasselbe Investment, dieselbe Person und dieselbe E-Mail, sonst NULL. Migration 20261007100000.';

-- ---------------------------------------------------------------------------
-- 8) Neuen Link anfordern (Glocke an den Zustaendigen)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sa_neuen_link_anfordern(_token text)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _z public.sa_fill_tokens%ROWTYPE;
  _kontakt_id uuid;
  _zustaendig uuid;
  _kunde text;
  _titel text := 'Selbstauskunft: neuer Link angefordert';
  _nachricht text;
  _empfaenger uuid;
BEGIN
  SELECT * INTO _z FROM public.sa_fill_tokens WHERE token = _token LIMIT 1;
  IF NOT FOUND OR _z.status <> 'pending' OR coalesce(_z.expires_at > now(), false) THEN
    RETURN 'nicht_moeglich';
  END IF;

  -- Bremse je Kontakt und Investment, nicht je Link: Mehrere alte Links
  -- desselben Vorgangs loesen zusammen hoechstens eine Glocke am Tag aus.
  PERFORM pg_advisory_xact_lock(hashtext('sa_neuer_link:' || _z.kontakt_id || ':' || _z.investment_id));
  IF EXISTS (
    SELECT 1 FROM public.sa_fill_tokens t
     WHERE t.kontakt_id = _z.kontakt_id
       AND t.investment_id = _z.investment_id
       AND t.neuer_link_angefordert_am > now() - interval '24 hours'
  ) THEN
    RETURN 'schon_angefordert';
  END IF;

  SELECT k.id, k.zustaendig_id, btrim(coalesce(k.vorname, '') || ' ' || coalesce(k.nachname, ''))
    INTO _kontakt_id, _zustaendig, _kunde
    FROM public.kontakte k
   WHERE k.id::text = _z.kontakt_id
     AND coalesce(k.geloescht, false) = false;
  IF _kontakt_id IS NULL THEN
    RETURN 'nicht_moeglich';
  END IF;

  _nachricht := coalesce(nullif(_kunde, ''), 'Ein Kunde')
    || CASE WHEN _z.person_nr = 2 THEN ' (Person 2)' ELSE '' END
    || ' hat den abgelaufenen Link zur Selbstauskunft geöffnet und bittet um einen neuen. '
    || 'Sende die Einladung im Kundenprofil erneut, dann gilt derselbe Link wieder und der Stand bleibt erhalten.';

  -- Glocke nur an den aktuell Zustaendigen, ohne ihn an die Leitung.
  IF _zustaendig IS NOT NULL THEN
    INSERT INTO public.benachrichtigungen (benutzer_id, titel, nachricht, link)
    VALUES (_zustaendig, _titel, _nachricht, '/kunden/' || _kontakt_id::text);
  ELSE
    FOR _empfaenger IN
      SELECT DISTINCT ur.user_id
        FROM public.user_roles ur
       WHERE ur.role IN ('admin'::public.app_role, 'inhaber'::public.app_role, 'vertriebsleiter'::public.app_role)
    LOOP
      INSERT INTO public.benachrichtigungen (benutzer_id, titel, nachricht, link)
      VALUES (_empfaenger, _titel, _nachricht, '/kunden/' || _kontakt_id::text);
    END LOOP;
  END IF;

  UPDATE public.sa_fill_tokens SET neuer_link_angefordert_am = now() WHERE id = _z.id;
  RETURN 'angefordert';
END;
$$;

REVOKE ALL ON FUNCTION public.sa_neuen_link_anfordern(text) FROM public;
GRANT EXECUTE ON FUNCTION public.sa_neuen_link_anfordern(text) TO anon, authenticated;

COMMENT ON FUNCTION public.sa_neuen_link_anfordern(text) IS
  'Abgelaufener Selbstauskunfts-Link: Glocke an den Zustaendigen (ohne ihn an Admin, Inhaber, Vertriebsleitung), hoechstens einmal je Kontakt und Investment in 24 Stunden. Migration 20261007100000.';

-- ---------------------------------------------------------------------------
-- 9) Abschicken: Status, Unterschriften, Stand und Abschluss unter einer Sperre
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sa_link_abschliessen(
  _token text,
  _sa_data jsonb,
  _signaturen jsonb,
  _signiert_am timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _z public.sa_fill_tokens%ROWTYPE;
  _sig jsonb;
  _kontakt uuid;
  _inv uuid;
  _stand jsonb;
  _fassung text;
BEGIN
  SELECT * INTO _z FROM public.sa_fill_tokens WHERE token = _token FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ergebnis', 'unbekannt');
  END IF;
  -- Derselbe Abschluss noch einmal (Netzaussetzer): Erfolg, nichts schreiben.
  IF _z.status = 'used' THEN
    RETURN jsonb_build_object('ergebnis', 'schon_abgeschlossen');
  END IF;
  IF _z.status <> 'pending' OR NOT coalesce(_z.expires_at > now(), false) THEN
    RETURN jsonb_build_object('ergebnis', 'abgelehnt');
  END IF;

  IF jsonb_typeof(_signaturen) <> 'array' OR jsonb_array_length(_signaturen) = 0 THEN
    RETURN jsonb_build_object('ergebnis', 'abgelehnt');
  END IF;
  FOR _sig IN SELECT value FROM jsonb_array_elements(_signaturen) LOOP
    IF NOT public.sa_signatur_passt(_z.person_nr, _sig ->> 'personType') THEN
      RETURN jsonb_build_object('ergebnis', 'falsche_person');
    END IF;
  END LOOP;

  _kontakt := public.sa_als_uuid(_z.kontakt_id);
  _inv := public.sa_als_uuid(_z.investment_id);
  IF _kontakt IS NULL OR (_inv IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.investments i WHERE i.id = _inv AND i.kunde_id = _kontakt
  )) THEN
    RETURN jsonb_build_object('ergebnis', 'zuordnung');
  END IF;

  -- Stand gegen den Stand am Investment in diesem Augenblick (Zeilensperre
  -- des UPDATE): Person 2 traegt nur person2Data ein.
  IF _inv IS NOT NULL THEN
    UPDATE public.investments
       SET meta = COALESCE(meta, '{}'::jsonb) || jsonb_build_object(
             'saData', public.sa_daten_fuer_person(_z.person_nr, _sa_data, meta -> 'saData'),
             'saEditStatus', 'none'),
           updated_at = now()
     WHERE id = _inv
     RETURNING meta -> 'saData' INTO _stand;
  END IF;
  _stand := coalesce(_stand, public.sa_daten_fuer_person(_z.person_nr, _sa_data, NULL));

  -- Je Fassung und Person hoechstens eine Unterschrift.
  _fassung := _z.id::text;
  FOR _sig IN SELECT value FROM jsonb_array_elements(_signaturen) LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.signature_requests r
       WHERE r.kontakt_id = _kontakt
         AND r.person_type = _sig ->> 'personType'
         AND r.status = 'signed'
         AND r.meta ->> 'saFassung' = _fassung
         AND r.investment_id IS NOT DISTINCT FROM _z.investment_id
    ) THEN
      INSERT INTO public.signature_requests (
        kontakt_id, investment_id, person_type, name, email, token, status, signed_at,
        signature_data, sa_data, consent_text, user_agent, expires_at, meta)
      VALUES (
        _kontakt, _z.investment_id, _sig ->> 'personType', coalesce(_sig ->> 'name', ''),
        coalesce(_sig ->> 'email', ''), gen_random_uuid()::text, 'signed', coalesce(_signiert_am, now()),
        _sig ->> 'signatureData', _stand, _sig ->> 'consentText', _sig ->> 'userAgent',
        now() + interval '7 days', jsonb_build_object('saFassung', _fassung));
    END IF;
  END LOOP;

  UPDATE public.sa_fill_tokens
     SET status = 'used', abgeschlossen_am = now()
   WHERE id = _z.id AND status = 'pending';
  RETURN jsonb_build_object('ergebnis', 'ok', 'saData', _stand);
END;
$$;

REVOKE ALL ON FUNCTION public.sa_link_abschliessen(text, jsonb, jsonb, timestamptz) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sa_link_abschliessen(text, jsonb, jsonb, timestamptz) TO service_role;

COMMENT ON FUNCTION public.sa_link_abschliessen(text, jsonb, jsonb, timestamptz) IS
  'Selbstauskunft abschicken unter der Sperre des Links: Status, Person, Unterschriften, Stand und pending zu used in einer Transaktion. Nur submit-sa-signature (service_role). Migration 20261007100000.';

COMMIT;

-- Nachsehen (aendert nichts): Pruefzeilen 91.1 bis 91.7 in
-- supabase/migrations-inbox/99_PRUEFUNG.sql.
