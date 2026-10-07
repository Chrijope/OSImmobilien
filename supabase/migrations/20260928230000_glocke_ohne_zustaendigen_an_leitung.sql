-- ===========================================================================
-- Glocke ohne Zustaendigen: auch an die Vertriebsleitung
-- ===========================================================================
--
-- Christians Entscheidung vom 28.09.2026: Prozess-Glocken fuer einen Kunden
-- ohne Zustaendigen gehen an Admin, Inhaber und Vertriebsleitung (Rollen
-- admin, inhaber, vertriebsleiter), nie an alle Vertriebspartner, jede Person
-- nur einmal. Mit Zustaendigem aendert sich nichts.
--
-- Zwei Datenbankfunktionen melden einen neuen Kontakt ohne Zustaendigen
-- bisher nur an admin und inhaber:
--   1. create_empfehlung_kontakt (Kunde empfiehlt im Portal jemanden)
--   2. create_tippgeber_lead (Tippgeber empfiehlt, 14 Parameter)
-- Beide bekommen in der Rueckfallschleife die Rolle vertriebsleiter dazu.
-- SELECT DISTINCT sorgt weiter dafuer, dass jemand mit mehreren dieser
-- Rollen genau eine Glocke bekommt.
--
-- Der uebrige Rumpf ist wortgleich zur Fassung aus 20260928180000, auch der
-- Kommentar im Rumpf ("an Admin und Inhaber"); er meint seit dieser
-- Migration Admin, Inhaber und Vertriebsleitung. Signaturen, SECURITY
-- DEFINER, search_path und Rechte bleiben gleich.
--
-- Die Glocken-Regel darf_glocke_senden (20260928160000) ist nicht betroffen:
-- Beide Funktionen laufen als SECURITY DEFINER und schreiben an der Regel
-- vorbei, wie bisher an Admin und Inhaber.
--
-- Keine Daten. Nur CREATE OR REPLACE, beliebig oft wiederholbar. Ohne diese
-- Migration laeuft alles weiter, die Vertriebsleitung erfaehrt dann nur von
-- diesen beiden Faellen nichts.
--
-- Voraussetzung: berater_name_normal aus 20260918220000.
-- ===========================================================================

BEGIN;

DO $$
BEGIN
  IF to_regprocedure('public.berater_name_normal(text)') IS NULL THEN
    RAISE EXCEPTION 'berater_name_normal fehlt. Zuerst 20260918220000_partnersuche_kennung_vor_name.sql ausfuehren.';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 1) Empfehlung aus dem Kundenportal
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_empfehlung_kontakt(
  _referrer_kontakt_id uuid,
  _vorname text,
  _nachname text,
  _email text,
  _telefon text,
  _quelle text,
  _berater text,
  _beziehung text,
  _anmerkungen text DEFAULT ''::text,
  _programm_id text DEFAULT ''::text,
  _investment_id text DEFAULT ''::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _referrer public.kontakte%ROWTYPE;
  _kontakt_id uuid;
  _emp_id uuid;
  _vp_id uuid;
  _vp_name text;
  _referrer_name text;
  _duplicate_id uuid;
  _duplicate_name text;
  _norm_tel text;
  _fallback_user uuid;
  _notify_msg text;
BEGIN
  SELECT * INTO _referrer
  FROM public.kontakte
  WHERE id = _referrer_kontakt_id
    AND (
      (meta ->> 'authUserId') = auth.uid()::text
      OR ((meta -> 'person2') ->> 'authUserId') = auth.uid()::text
    );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  _vp_id := _referrer.zustaendig_id;
  _vp_name := COALESCE(NULLIF(_referrer.berater, ''), NULLIF(_berater, ''));
  _referrer_name := trim(_referrer.vorname || ' ' || _referrer.nachname);

  -- Neu am 28.09.2026: Der Name zaehlt nur, wenn genau ein Profil so heisst.
  -- Vorher gewann bei zwei Gleichnamigen das neuere Profil, geraten. Ohne
  -- eindeutigen Treffer bleibt der Kontakt ohne Zustaendigkeit, und die
  -- Glocke geht unten wie bei jedem Kontakt ohne Partner an Admin und Inhaber.
  IF _vp_id IS NULL AND _vp_name IS NOT NULL THEN
    SELECT CASE WHEN count(*) = 1 THEN (array_agg(p.id))[1] END INTO _vp_id
    FROM public.profiles p
    WHERE public.berater_name_normal(p.name) = public.berater_name_normal(_vp_name);
    IF _vp_id IS NULL THEN
      RAISE WARNING 'Partnername nicht eindeutig oder unbekannt, Kontakt ohne Zustaendigkeit angelegt';
    END IF;
  END IF;

  _norm_tel := regexp_replace(COALESCE(_telefon, ''), '[^0-9]', '', 'g');

  SELECT id, trim(vorname || ' ' || nachname) INTO _duplicate_id, _duplicate_name
  FROM public.kontakte
  WHERE (
      (NULLIF(_email, '') IS NOT NULL AND lower(email) = lower(_email))
      OR (length(_norm_tel) >= 6 AND regexp_replace(COALESCE(telefon, ''), '[^0-9]', '', 'g') = _norm_tel)
    )
  LIMIT 1;

  _kontakt_id := gen_random_uuid();
  _emp_id := gen_random_uuid();

  IF _duplicate_id IS NOT NULL THEN
    _kontakt_id := _duplicate_id;
  ELSE
    INSERT INTO public.kontakte (id, vorname, nachname, email, telefon, quelle, berater, zustaendig_id, status, meta)
    VALUES (
      _kontakt_id,
      NULLIF(_vorname, ''),
      NULLIF(_nachname, ''),
      NULLIF(_email, ''),
      NULLIF(_telefon, ''),
      COALESCE(NULLIF(_quelle, ''), 'Empfehlung von ' || _referrer_name),
      _vp_name,
      _vp_id,
      'kontaktiert',
      jsonb_build_object(
        'pipelineStufe', 'erstgespraech',
        'leadTyp', 'empfehlung',
        'zugewiesenAm', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'empfehlungsgeber', true,
        'empfehlungsgeberName', _referrer_name,
        'empfehlungsgeberKontaktId', _referrer_kontakt_id::text,
        'empfehlungsgeberBeziehung', COALESCE(_beziehung, ''),
        'empfehlungsgeberVpId', COALESCE(_vp_id::text, ''),
        'empfehlungId', _emp_id::text,
        'empfehlungAnmerkungen', COALESCE(_anmerkungen, ''),
        'empfehlungEmail', COALESCE(_email, ''),
        'empfehlungTelefon', COALESCE(_telefon, '')
      )
    );
  END IF;

  INSERT INTO public.empfehlungen (id, empfohlen_name, empfohlen_email, empfohlen_telefon, empfohlen_von, status, kontakt_id, meta)
  VALUES (
    _emp_id,
    trim(_vorname || ' ' || _nachname),
    NULLIF(_email, ''),
    NULLIF(_telefon, ''),
    _referrer_name,
    CASE WHEN _duplicate_id IS NOT NULL THEN 'dublette' ELSE 'neu' END,
    _kontakt_id,
    jsonb_build_object(
      'programmId', COALESCE(_programm_id, ''),
      'investmentId', COALESCE(_investment_id, ''),
      'kontaktId', _referrer_kontakt_id::text,
      'kontaktName', _referrer_name,
      'empfehlenderKundeId', _referrer_kontakt_id::text,
      'empfehlenderName', _referrer_name,
      'beziehung', COALESCE(_beziehung, ''),
      'anmerkungen', COALESCE(_anmerkungen, ''),
      'berater', COALESCE(_vp_name, ''),
      'vpId', COALESCE(_vp_id::text, ''),
      'praemieStatus', 'ausstehend',
      'neuerKontaktId', _kontakt_id::text,
      'dublette', (_duplicate_id IS NOT NULL),
      'dubletteVon', COALESCE(_duplicate_name, '')
    )
  );

  _notify_msg := 'Ihr Kunde ' || _referrer_name || ' hat eine neue Empfehlung gesendet: '
    || trim(_vorname || ' ' || _nachname)
    || COALESCE(' (' || NULLIF(_telefon, '') || ')', '')
    || CASE WHEN _duplicate_id IS NOT NULL
            THEN ' — ACHTUNG: Dublette zu bestehendem Kontakt "' || COALESCE(_duplicate_name, '') || '". Bitte prüfen.'
            ELSE '. Der Kontakt wurde automatisch in Kontakte angelegt.'
       END;

  IF _vp_id IS NOT NULL THEN
    INSERT INTO public.benachrichtigungen (benutzer_id, titel, nachricht, link)
    VALUES (
      _vp_id,
      'Neue Empfehlung von ' || _referrer_name,
      _notify_msg,
      '/kunden/' || _kontakt_id::text
    );
  ELSE
    FOR _fallback_user IN
      SELECT DISTINCT ur.user_id
      FROM public.user_roles ur
      WHERE ur.role IN ('admin'::public.app_role, 'inhaber'::public.app_role, 'vertriebsleiter'::public.app_role)
    LOOP
      INSERT INTO public.benachrichtigungen (benutzer_id, titel, nachricht, link)
      VALUES (
        _fallback_user,
        'Neue Empfehlung ohne Zuständigkeit',
        _notify_msg,
        '/kunden/' || _kontakt_id::text
      );
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'kontakt_id', _kontakt_id,
    'empfehlung_id', _emp_id,
    'vp_id', _vp_id,
    'duplicate', (_duplicate_id IS NOT NULL),
    'duplicate_name', COALESCE(_duplicate_name, '')
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 2) Empfehlung aus dem Tippgeber-Portal
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_tippgeber_lead(
  _vorname text,
  _nachname text,
  _email text,
  _telefon text,
  _anliegen text DEFAULT '',
  _ziel text DEFAULT '',
  _einkommen text DEFAULT '',
  _eigenkapital text DEFAULT '',
  _berufliche_situation text DEFAULT '',
  _schufa_sauber text DEFAULT '',
  _investitions_zeitpunkt text DEFAULT '',
  _einverstaendnis boolean DEFAULT NULL,
  _einverstaendnis_fassung text DEFAULT NULL,
  _einverstaendnis_wortlaut text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tipp public.tippgeber%ROWTYPE;
  _vp_id uuid;
  _vp_name text;
  _kontakt_id uuid;
  _tipp_name text;
  _fallback_user uuid;
  _notify_msg text;
  _einverstaendnis_meta jsonb := '{}'::jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'tippgeber'::public.app_role) THEN
    RAISE EXCEPTION 'Nur Tippgeber dürfen diese Funktion nutzen';
  END IF;

  -- Neuer Browser: ohne bestätigtes Einverständnis wird nichts angelegt.
  -- Alter Browser (keiner der drei Parameter): Übergang, siehe Kopf.
  IF _einverstaendnis IS NOT NULL OR _einverstaendnis_fassung IS NOT NULL OR _einverstaendnis_wortlaut IS NOT NULL THEN
    IF _einverstaendnis IS NOT TRUE OR NULLIF(trim(COALESCE(_einverstaendnis_fassung, '')), '') IS NULL THEN
      RAISE EXCEPTION 'Bitte bestätige, dass die empfohlene Person mit der Weitergabe ihrer Kontaktdaten einverstanden ist.'
        USING ERRCODE = '22023';
    END IF;
    _einverstaendnis_meta := jsonb_build_object(
      'tippgeberEinverstaendnis', jsonb_build_object(
        'bestaetigt', true,
        'bestaetigtAm', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'fassung', left(trim(_einverstaendnis_fassung), 100),
        'wortlaut', NULLIF(left(trim(COALESCE(_einverstaendnis_wortlaut, '')), 1000), ''),
        'bestaetigtVon', auth.uid()::text
      )
    );
  END IF;

  SELECT * INTO _tipp FROM public.tippgeber WHERE benutzer_id = auth.uid() LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kein Tippgeber-Profil gefunden';
  END IF;

  _vp_id := _tipp.zugeordnet_id;
  _vp_name := NULLIF(_tipp.zugeordnet_name, '');
  _tipp_name := trim(_tipp.vorname || ' ' || _tipp.nachname);

  -- Neu am 28.09.2026: Der Name zaehlt nur, wenn genau ein Profil so heisst.
  -- Vorher gewann bei zwei Gleichnamigen das neuere Profil, geraten. Ohne
  -- eindeutigen Treffer bleibt der Kontakt ohne Zustaendigkeit, und die
  -- Glocke geht unten wie bei jedem Kontakt ohne Partner an Admin und Inhaber.
  IF _vp_id IS NULL AND _vp_name IS NOT NULL THEN
    SELECT CASE WHEN count(*) = 1 THEN (array_agg(p.id))[1] END INTO _vp_id
    FROM public.profiles p
    WHERE public.berater_name_normal(p.name) = public.berater_name_normal(_vp_name);
    IF _vp_id IS NULL THEN
      RAISE WARNING 'Partnername nicht eindeutig oder unbekannt, Kontakt ohne Zustaendigkeit angelegt';
    END IF;
  END IF;

  _kontakt_id := gen_random_uuid();

  INSERT INTO public.kontakte (id, vorname, nachname, email, telefon, quelle, berater, zustaendig_id, status, meta)
  VALUES (
    _kontakt_id,
    NULLIF(_vorname, ''),
    NULLIF(_nachname, ''),
    NULLIF(_email, ''),
    NULLIF(_telefon, ''),
    'Empfehlung von Tippgeber ' || _tipp_name,
    _vp_name,
    _vp_id,
    'kontaktiert',
    jsonb_build_object(
      'pipelineStufe', 'erstgespraech',
      'leadTyp', 'empfehlung',
      'zugewiesenAm', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'empfehlungsgeber', true,
      'empfehlungsgeberName', _tipp_name,
      'empfehlungsgeberBeziehung', 'Tippgeber',
      'tippgeberId', _tipp.id::text,
      'tippgeberName', _tipp_name,
      'tippgeberBenutzerId', auth.uid()::text,
      'tippgeberAnliegen', COALESCE(_anliegen, ''),
      'erstelltVonId', auth.uid()::text,
      'erstelltVonName', _tipp_name,
      'qualZiel', NULLIF(_ziel, ''),
      'qualEinkommen', NULLIF(_einkommen, ''),
      'qualEigenkapital', NULLIF(_eigenkapital, ''),
      'qualBeruflicheSituation', NULLIF(_berufliche_situation, ''),
      'tippgeberSchufaSauber', NULLIF(_schufa_sauber, ''),
      'tippgeberInvestitionsZeitpunkt', NULLIF(_investitions_zeitpunkt, '')
    ) || _einverstaendnis_meta
  );

  _notify_msg := _tipp_name || ' hat einen neuen Lead empfohlen: '
    || trim(_vorname || ' ' || _nachname)
    || COALESCE(' (' || NULLIF(_telefon, '') || ')', '')
    || '. Der Kontakt wurde automatisch in Kontakte angelegt.';

  IF _vp_id IS NOT NULL THEN
    INSERT INTO public.benachrichtigungen (benutzer_id, titel, nachricht, link)
    VALUES (
      _vp_id,
      'Neuer Lead von Tippgeber ' || _tipp_name,
      _notify_msg,
      '/kunden/' || _kontakt_id::text
    );
  ELSE
    FOR _fallback_user IN
      SELECT DISTINCT ur.user_id
      FROM public.user_roles ur
      WHERE ur.role IN ('admin'::public.app_role, 'inhaber'::public.app_role, 'vertriebsleiter'::public.app_role)
    LOOP
      INSERT INTO public.benachrichtigungen (benutzer_id, titel, nachricht, link)
      VALUES (
        _fallback_user,
        'Tippgeber-Lead ohne Zuständigkeit',
        _notify_msg,
        '/kunden/' || _kontakt_id::text
      );
    END LOOP;
  END IF;

  RETURN jsonb_build_object('kontakt_id', _kontakt_id, 'vp_id', _vp_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_tippgeber_lead(text, text, text, text, text, text, text, text, text, text, text, boolean, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_tippgeber_lead(text, text, text, text, text, text, text, text, text, text, text, boolean, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Nachsehen (aendert nichts): Pruefzeile 39.1 in
-- supabase/migrations-inbox/99_PRUEFUNG.sql.
