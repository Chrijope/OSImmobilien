
-- ============================================================
-- 1) RLS-Härtung auf public.kontakte
-- ============================================================

-- Alte interne Policies entfernen
DROP POLICY IF EXISTS "Interne sehen Kontakte" ON public.kontakte;
DROP POLICY IF EXISTS "Interne bearbeiten Kontakte" ON public.kontakte;
DROP POLICY IF EXISTS "Interne loeschen Kontakte" ON public.kontakte;
DROP POLICY IF EXISTS "Interne erstellen Kontakte" ON public.kontakte;

-- Helper: ist Vertriebspartner für genau diesen Kontakt zuständig?
CREATE OR REPLACE FUNCTION public.is_vp_owner_of_kontakt(_user_id uuid, _zustaendig_id uuid, _meta jsonb)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    _zustaendig_id = _user_id
    OR (_meta ->> 'erstelltVonId') = _user_id::text
    OR (_meta ->> 'empfehlungsgeberVpId') = _user_id::text
$$;

-- Voller interner Zugriff für alle Rollen AUSSER vertriebspartner
CREATE POLICY "Interne (non-VP) sehen Kontakte"
ON public.kontakte FOR SELECT TO authenticated
USING (
  public.is_internal_role(auth.uid())
  AND NOT public.has_role(auth.uid(), 'vertriebspartner')
);

CREATE POLICY "Interne (non-VP) bearbeiten Kontakte"
ON public.kontakte FOR UPDATE TO authenticated
USING (
  public.is_internal_role(auth.uid())
  AND NOT public.has_role(auth.uid(), 'vertriebspartner')
);

CREATE POLICY "Interne (non-VP) loeschen Kontakte"
ON public.kontakte FOR DELETE TO authenticated
USING (
  public.is_internal_role(auth.uid())
  AND NOT public.has_role(auth.uid(), 'vertriebspartner')
);

CREATE POLICY "Interne erstellen Kontakte"
ON public.kontakte FOR INSERT TO authenticated
WITH CHECK (public.is_internal_role(auth.uid()));

-- VP-spezifische, eingeschränkte Sichtbarkeit/Bearbeitung
CREATE POLICY "Vertriebspartner sehen eigene Kontakte"
ON public.kontakte FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'vertriebspartner')
  AND public.is_vp_owner_of_kontakt(auth.uid(), zustaendig_id, meta)
);

CREATE POLICY "Vertriebspartner bearbeiten eigene Kontakte"
ON public.kontakte FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'vertriebspartner')
  AND public.is_vp_owner_of_kontakt(auth.uid(), zustaendig_id, meta)
);

CREATE POLICY "Vertriebspartner loeschen eigene Kontakte"
ON public.kontakte FOR DELETE TO authenticated
USING (
  public.has_role(auth.uid(), 'vertriebspartner')
  AND public.is_vp_owner_of_kontakt(auth.uid(), zustaendig_id, meta)
);

-- ============================================================
-- 2) Empfehlung aus Kundenportal: VP-Zuweisung + Benachrichtigung
-- ============================================================

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

  _kontakt_id := gen_random_uuid();
  _emp_id := gen_random_uuid();

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

  INSERT INTO empfehlungen (id, empfohlen_name, empfohlen_email, empfohlen_telefon, empfohlen_von, status, meta)
  VALUES (
    _emp_id,
    _vorname || ' ' || _nachname,
    _email,
    _telefon,
    _referrer_name,
    'neu',
    jsonb_build_object(
      'programmId', _programm_id,
      'investmentId', _investment_id,
      'kontaktId', _referrer_kontakt_id::text,
      'kontaktName', _referrer_name,
      'beziehung', _beziehung,
      'anmerkungen', _anmerkungen,
      'neuerKontaktId', _kontakt_id::text
    )
  );

  -- Benachrichtigung an den zuständigen Vertriebspartner
  IF _vp_id IS NOT NULL THEN
    INSERT INTO public.benachrichtigungen (benutzer_id, titel, nachricht, link)
    VALUES (
      _vp_id,
      'Neue Empfehlung von ' || _referrer_name,
      'Ihr Kunde ' || _referrer_name || ' hat Ihnen eine neue Empfehlung gesendet: '
        || _vorname || ' ' || _nachname
        || COALESCE(' (' || NULLIF(_telefon,'') || ')', '')
        || '. Bitte kontaktieren Sie die Person zeitnah.',
      '/kunden/' || _kontakt_id::text
    );
  END IF;

  RETURN jsonb_build_object('kontakt_id', _kontakt_id, 'empfehlung_id', _emp_id, 'vp_id', _vp_id);
END;
$function$;
