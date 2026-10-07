
CREATE OR REPLACE FUNCTION public.create_empfehlung_kontakt(
  _referrer_kontakt_id uuid,
  _vorname text,
  _nachname text,
  _email text,
  _telefon text,
  _quelle text,
  _berater text,
  _beziehung text,
  _anmerkungen text DEFAULT '',
  _programm_id text DEFAULT '',
  _investment_id text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _referrer kontakte%ROWTYPE;
  _kontakt_id uuid;
  _emp_id uuid;
BEGIN
  SELECT * INTO _referrer
  FROM kontakte
  WHERE id = _referrer_kontakt_id
    AND (meta ->> 'authUserId') = auth.uid()::text;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  _kontakt_id := gen_random_uuid();
  _emp_id := gen_random_uuid();

  INSERT INTO kontakte (id, vorname, nachname, email, telefon, quelle, berater, status, meta)
  VALUES (
    _kontakt_id,
    _vorname,
    _nachname,
    _email,
    _telefon,
    _quelle,
    _berater,
    'neu',
    jsonb_build_object(
      'empfehlungsgeber', true,
      'empfehlungsgeberName', _referrer.vorname || ' ' || _referrer.nachname,
      'empfehlungsgeberKontaktId', _referrer_kontakt_id::text,
      'pipelineStufe', 'neuer_lead'
    )
  );

  INSERT INTO empfehlungen (id, empfohlen_name, empfohlen_email, empfohlen_telefon, empfohlen_von, status, meta)
  VALUES (
    _emp_id,
    _vorname || ' ' || _nachname,
    _email,
    _telefon,
    _referrer.vorname || ' ' || _referrer.nachname,
    'neu',
    jsonb_build_object(
      'programmId', _programm_id,
      'investmentId', _investment_id,
      'kontaktId', _referrer_kontakt_id::text,
      'kontaktName', _referrer.vorname || ' ' || _referrer.nachname,
      'beziehung', _beziehung,
      'anmerkungen', _anmerkungen,
      'neuerKontaktId', _kontakt_id::text
    )
  );

  RETURN jsonb_build_object('kontakt_id', _kontakt_id, 'empfehlung_id', _emp_id);
END;
$$;
