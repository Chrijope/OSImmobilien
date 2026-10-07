CREATE OR REPLACE FUNCTION public.trigger_send_web_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Die Glocken-Benachrichtigung darf nie durch Web-Push blockiert werden.
  -- Korrekte Zielspalte ist benutzer_id; ältere Versionen referenzierten user_id.
  IF NEW.benutzer_id IS NULL THEN
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

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

  IF _vp_id IS NULL AND _vp_name IS NOT NULL THEN
    SELECT p.id INTO _vp_id
    FROM public.profiles p
    WHERE lower(trim(p.name)) = lower(trim(_vp_name))
    ORDER BY p.created_at DESC NULLS LAST
    LIMIT 1;
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

  INSERT INTO public.empfehlungen (id, empfohlen_name, empfohlen_email, empfohlen_telefon, empfohlen_von, status, meta)
  VALUES (
    _emp_id,
    trim(_vorname || ' ' || _nachname),
    NULLIF(_email, ''),
    NULLIF(_telefon, ''),
    _referrer_name,
    CASE WHEN _duplicate_id IS NOT NULL THEN 'dublette' ELSE 'neu' END,
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
      WHERE ur.role IN ('admin'::public.app_role, 'inhaber'::public.app_role)
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
  _investitions_zeitpunkt text DEFAULT ''
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
BEGIN
  IF NOT public.has_role(auth.uid(), 'tippgeber'::public.app_role) THEN
    RAISE EXCEPTION 'Nur Tippgeber dürfen diese Funktion nutzen';
  END IF;

  SELECT * INTO _tipp FROM public.tippgeber WHERE benutzer_id = auth.uid() LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kein Tippgeber-Profil gefunden';
  END IF;

  _vp_id := _tipp.zugeordnet_id;
  _vp_name := NULLIF(_tipp.zugeordnet_name, '');
  _tipp_name := trim(_tipp.vorname || ' ' || _tipp.nachname);

  IF _vp_id IS NULL AND _vp_name IS NOT NULL THEN
    SELECT p.id INTO _vp_id
    FROM public.profiles p
    WHERE lower(trim(p.name)) = lower(trim(_vp_name))
    ORDER BY p.created_at DESC NULLS LAST
    LIMIT 1;
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
    )
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
      WHERE ur.role IN ('admin'::public.app_role, 'inhaber'::public.app_role)
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

CREATE OR REPLACE FUNCTION public.create_tippgeber_lead(
  _vorname text,
  _nachname text,
  _email text,
  _telefon text,
  _anliegen text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.create_tippgeber_lead(
    _vorname,
    _nachname,
    _email,
    _telefon,
    _anliegen,
    '',
    '',
    '',
    '',
    '',
    ''
  );
END;
$$;