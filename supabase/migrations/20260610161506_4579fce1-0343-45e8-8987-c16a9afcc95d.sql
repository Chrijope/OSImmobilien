-- Overload 1 (kurze Signatur)
CREATE OR REPLACE FUNCTION public.create_tippgeber_lead(_vorname text, _nachname text, _email text, _telefon text, _anliegen text DEFAULT ''::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _tipp public.tippgeber%ROWTYPE;
  _vp_id uuid;
  _vp_name text;
  _kontakt_id uuid;
  _tipp_name text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'tippgeber'::app_role) THEN
    RAISE EXCEPTION 'Nur Tippgeber dürfen diese Funktion nutzen';
  END IF;

  SELECT * INTO _tipp FROM public.tippgeber WHERE benutzer_id = auth.uid() LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Kein Tippgeber-Profil gefunden'; END IF;

  _vp_id := _tipp.zugeordnet_id;
  _vp_name := _tipp.zugeordnet_name;
  _tipp_name := _tipp.vorname || ' ' || _tipp.nachname;
  _kontakt_id := gen_random_uuid();

  INSERT INTO public.kontakte (id, vorname, nachname, email, telefon, quelle, berater, zustaendig_id, status, meta)
  VALUES (
    _kontakt_id, _vorname, _nachname, NULLIF(_email, ''), NULLIF(_telefon, ''),
    'Tippgeber', _vp_name, _vp_id, 'neu',
    jsonb_build_object(
      'pipelineStufe', 'erstgespraech',
      'tippgeberId', _tipp.id::text,
      'tippgeberName', _tipp_name,
      'tippgeberBenutzerId', auth.uid()::text,
      'tippgeberAnliegen', COALESCE(_anliegen, '')
    )
  );

  IF _vp_id IS NOT NULL THEN
    INSERT INTO public.benachrichtigungen (benutzer_id, titel, nachricht, link)
    VALUES (
      _vp_id,
      'Neuer Lead von Tippgeber ' || _tipp_name,
      _tipp_name || ' hat dir einen neuen Lead empfohlen: ' || _vorname || ' ' || _nachname
        || COALESCE(' (' || NULLIF(_telefon, '') || ')', ''),
      '/kunden/' || _kontakt_id::text
    );
  END IF;

  RETURN jsonb_build_object('kontakt_id', _kontakt_id, 'vp_id', _vp_id);
END;
$function$;

-- Overload 2 (lange Signatur mit Qualifizierungsfeldern)
CREATE OR REPLACE FUNCTION public.create_tippgeber_lead(
  _vorname text, _nachname text, _email text, _telefon text,
  _anliegen text DEFAULT ''::text, _ziel text DEFAULT ''::text,
  _einkommen text DEFAULT ''::text, _eigenkapital text DEFAULT ''::text,
  _berufliche_situation text DEFAULT ''::text, _schufa_sauber text DEFAULT ''::text,
  _investitions_zeitpunkt text DEFAULT ''::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _tipp public.tippgeber%ROWTYPE;
  _vp_id uuid;
  _vp_name text;
  _kontakt_id uuid;
  _tipp_name text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'tippgeber'::app_role) THEN
    RAISE EXCEPTION 'Nur Tippgeber dürfen diese Funktion nutzen';
  END IF;

  SELECT * INTO _tipp FROM public.tippgeber WHERE benutzer_id = auth.uid() LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Kein Tippgeber-Profil gefunden'; END IF;

  _vp_id := _tipp.zugeordnet_id;
  _vp_name := _tipp.zugeordnet_name;
  _tipp_name := _tipp.vorname || ' ' || _tipp.nachname;
  _kontakt_id := gen_random_uuid();

  INSERT INTO public.kontakte (id, vorname, nachname, email, telefon, quelle, berater, zustaendig_id, status, meta)
  VALUES (
    _kontakt_id, _vorname, _nachname, NULLIF(_email, ''), NULLIF(_telefon, ''),
    'Tippgeber', _vp_name, _vp_id, 'neu',
    jsonb_build_object(
      'pipelineStufe', 'erstgespraech',
      'zugewiesenAm', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'tippgeberId', _tipp.id::text,
      'tippgeberName', _tipp_name,
      'tippgeberBenutzerId', auth.uid()::text,
      'tippgeberAnliegen', COALESCE(_anliegen, ''),
      'empfehlungsgeberName', _tipp_name,
      'empfehlungsgeberBeziehung', 'Tippgeber',
      'erstelltVonId', auth.uid()::text,
      'erstelltVonName', _tipp_name,
      'qualZiel', COALESCE(NULLIF(_ziel, ''), NULL),
      'qualEinkommen', COALESCE(NULLIF(_einkommen, ''), NULL),
      'qualEigenkapital', COALESCE(NULLIF(_eigenkapital, ''), NULL),
      'qualBeruflicheSituation', COALESCE(NULLIF(_berufliche_situation, ''), NULL),
      'tippgeberSchufaSauber', COALESCE(NULLIF(_schufa_sauber, ''), NULL),
      'tippgeberInvestitionsZeitpunkt', COALESCE(NULLIF(_investitions_zeitpunkt, ''), NULL)
    )
  );

  IF _vp_id IS NOT NULL THEN
    INSERT INTO public.benachrichtigungen (benutzer_id, titel, nachricht, link)
    VALUES (
      _vp_id,
      'Neuer Lead von Tippgeber ' || _tipp_name,
      _tipp_name || ' hat dir einen neuen Lead empfohlen: ' || _vorname || ' ' || _nachname
        || COALESCE(' (' || NULLIF(_telefon, '') || ')', ''),
      '/kunden/' || _kontakt_id::text
    );
  END IF;

  RETURN jsonb_build_object('kontakt_id', _kontakt_id, 'vp_id', _vp_id);
END;
$function$;

-- Backfill: bestehende Tippgeber-Kontakte auf Erstgespräch heben
UPDATE public.kontakte
SET meta = jsonb_set(COALESCE(meta, '{}'::jsonb), '{pipelineStufe}', '"erstgespraech"'::jsonb)
WHERE meta ? 'tippgeberId'
  AND COALESCE(meta->>'pipelineStufe', 'neuer_lead') IN ('neuer_lead', 'zugewiesen');