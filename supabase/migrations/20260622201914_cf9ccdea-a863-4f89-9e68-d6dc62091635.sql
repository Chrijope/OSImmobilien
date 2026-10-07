-- Empfehlungs-RPC erweitern: Dublettencheck + Backup-Benachrichtigung an Setter/Admin

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
SET search_path TO 'public'
AS $function$
DECLARE
  _referrer kontakte%ROWTYPE;
  _kontakt_id uuid;
  _emp_id uuid;
  _vp_id uuid;
  _vp_name text;
  _referrer_name text;
  _duplicate_id uuid;
  _duplicate_name text;
  _norm_tel text;
  _backup_user uuid;
  _notify_msg text;
BEGIN
  SELECT * INTO _referrer
  FROM kontakte
  WHERE id = _referrer_kontakt_id
    AND (meta ->> 'authUserId') = auth.uid()::text;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  _vp_id := _referrer.zustaendig_id;
  _vp_name := COALESCE(NULLIF(_referrer.berater, ''), _berater);
  _referrer_name := _referrer.vorname || ' ' || _referrer.nachname;

  -- ── Dublettencheck (Email / normalisierte Telefonnummer) ──
  _norm_tel := regexp_replace(COALESCE(_telefon, ''), '[^0-9]', '', 'g');

  SELECT id, (vorname || ' ' || nachname) INTO _duplicate_id, _duplicate_name
  FROM kontakte
  WHERE (
      (NULLIF(_email, '') IS NOT NULL AND lower(email) = lower(_email))
      OR (length(_norm_tel) >= 6 AND regexp_replace(COALESCE(telefon, ''), '[^0-9]', '', 'g') = _norm_tel)
    )
  LIMIT 1;

  _kontakt_id := gen_random_uuid();
  _emp_id := gen_random_uuid();

  -- Bei Dublette KEINEN neuen Kontakt anlegen, aber Empfehlung trotzdem speichern (auf bestehenden Kontakt)
  IF _duplicate_id IS NOT NULL THEN
    _kontakt_id := _duplicate_id;
  ELSE
    INSERT INTO kontakte (id, vorname, nachname, email, telefon, quelle, berater, zustaendig_id, status, meta)
    VALUES (
      _kontakt_id,
      _vorname,
      _nachname,
      _email,
      _telefon,
      _quelle,
      _vp_name,
      _vp_id,
      'neu',
      jsonb_build_object(
        'empfehlungsgeber', true,
        'empfehlungsgeberName', _referrer_name,
        'empfehlungsgeberKontaktId', _referrer_kontakt_id::text,
        'empfehlungsgeberBeziehung', _beziehung,
        'empfehlungsgeberVpId', COALESCE(_vp_id::text, ''),
        'pipelineStufe', 'neuer_lead'
      )
    );
  END IF;

  INSERT INTO empfehlungen (id, empfohlen_name, empfohlen_email, empfohlen_telefon, empfohlen_von, status, meta)
  VALUES (
    _emp_id,
    _vorname || ' ' || _nachname,
    _email,
    _telefon,
    _referrer_name,
    CASE WHEN _duplicate_id IS NOT NULL THEN 'dublette' ELSE 'neu' END,
    jsonb_build_object(
      'programmId', _programm_id,
      'investmentId', _investment_id,
      'kontaktId', _referrer_kontakt_id::text,
      'kontaktName', _referrer_name,
      'beziehung', _beziehung,
      'anmerkungen', _anmerkungen,
      'neuerKontaktId', _kontakt_id::text,
      'dublette', (_duplicate_id IS NOT NULL),
      'dubletteVon', COALESCE(_duplicate_name, '')
    )
  );

  -- Nachricht zusammenbauen
  _notify_msg := 'Ihr Kunde ' || _referrer_name || ' hat eine neue Empfehlung gesendet: '
    || _vorname || ' ' || _nachname
    || COALESCE(' (' || NULLIF(_telefon,'') || ')', '')
    || CASE WHEN _duplicate_id IS NOT NULL
            THEN ' — ACHTUNG: Dublette zu bestehendem Kontakt "' || _duplicate_name || '". Bitte prüfen.'
            ELSE '. Bitte kontaktieren Sie die Person zeitnah.'
       END;

  -- Benachrichtigung an den zuständigen Vertriebspartner
  IF _vp_id IS NOT NULL THEN
    INSERT INTO public.benachrichtigungen (benutzer_id, titel, nachricht, link)
    VALUES (
      _vp_id,
      'Neue Empfehlung von ' || _referrer_name,
      _notify_msg,
      '/kunden/' || _kontakt_id::text
    );
  END IF;

  -- Backup-Benachrichtigung an alle Setter + Admin/Inhaber (immer, damit Empfehlung nicht untergeht)
  FOR _backup_user IN
    SELECT DISTINCT ur.user_id
    FROM public.user_roles ur
    WHERE ur.role IN ('setterin'::app_role, 'admin'::app_role, 'inhaber'::app_role)
      AND (_vp_id IS NULL OR ur.user_id <> _vp_id)
  LOOP
    INSERT INTO public.benachrichtigungen (benutzer_id, titel, nachricht, link)
    VALUES (
      _backup_user,
      'Neue Empfehlung von ' || _referrer_name,
      _notify_msg,
      '/kunden/' || _kontakt_id::text
    );
  END LOOP;

  RETURN jsonb_build_object(
    'kontakt_id', _kontakt_id,
    'empfehlung_id', _emp_id,
    'vp_id', _vp_id,
    'duplicate', (_duplicate_id IS NOT NULL),
    'duplicate_name', COALESCE(_duplicate_name, '')
  );
END;
$function$;