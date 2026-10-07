CREATE OR REPLACE FUNCTION public.dsgvo_hard_delete_kontakt(
  _kontakt_id uuid,
  _grund_referenz text,
  _name_confirmation text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _kontakt kontakte%ROWTYPE;
  _expected_name text;
  _email_hash text;
  _name_hash text;
  _actor_name text;
BEGIN
  IF NOT public.is_admin_role(auth.uid()) THEN
    RAISE EXCEPTION 'Nur Admin oder Inhaber dürfen die DSGVO-Sofortlöschung ausführen';
  END IF;

  IF _grund_referenz IS NULL OR length(trim(_grund_referenz)) < 3 THEN
    RAISE EXCEPTION 'Pflichtfeld Grund-Referenz fehlt';
  END IF;

  SELECT * INTO _kontakt FROM public.kontakte WHERE id = _kontakt_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kontakt nicht gefunden';
  END IF;

  _expected_name := trim(coalesce(_kontakt.vorname, '') || ' ' || coalesce(_kontakt.nachname, ''));
  IF lower(trim(coalesce(_name_confirmation, ''))) <> lower(_expected_name) THEN
    RAISE EXCEPTION 'Namens-Bestätigung stimmt nicht überein';
  END IF;

  _email_hash := encode(digest(lower(coalesce(_kontakt.email, '')), 'sha256'), 'hex');
  _name_hash := encode(digest(lower(_expected_name), 'sha256'), 'hex');

  SELECT name INTO _actor_name FROM public.profiles WHERE id = auth.uid();

  -- PII-Maskierung
  UPDATE public.audit_log
  SET vorher = CASE WHEN vorher IS NOT NULL THEN jsonb_build_object('redacted', '[GELÖSCHT DSGVO]') ELSE NULL END,
      nachher = CASE WHEN nachher IS NOT NULL THEN jsonb_build_object('redacted', '[GELÖSCHT DSGVO]') ELSE NULL END,
      actor_email = CASE WHEN actor_email = _kontakt.email THEN '[GELÖSCHT DSGVO]' ELSE actor_email END
  WHERE entity = 'kontakte' AND entity_id = _kontakt_id::text;

  INSERT INTO public.dsgvo_deletion_log
    (kontakt_id, email_hash, name_hash, geloeschtVon, geloeschtVon_name, grund_referenz)
  VALUES
    (_kontakt_id, _email_hash, _name_hash, auth.uid(), _actor_name, _grund_referenz);

  INSERT INTO public.audit_log (actor, actor_email, action, entity, entity_id, meta)
  VALUES (
    auth.uid(),
    (SELECT email FROM auth.users WHERE id = auth.uid()),
    'dsgvo_hard_delete',
    'kontakte',
    _kontakt_id::text,
    jsonb_build_object(
      'grund_referenz', _grund_referenz,
      'email_hash', _email_hash,
      'name_hash', _name_hash,
      'actor_name', _actor_name
    )
  );

  DELETE FROM public.aktivitaeten WHERE kunde_id = _kontakt_id::text;
  DELETE FROM public.benachrichtigungen WHERE link LIKE '%' || _kontakt_id::text || '%';
  DELETE FROM public.follow_ups WHERE kunde_id = _kontakt_id;
  DELETE FROM public.aufgaben WHERE kontakt_id = _kontakt_id;
  DELETE FROM public.sa_fill_tokens WHERE kontakt_id = _kontakt_id;

  DELETE FROM public.kontakte WHERE id = _kontakt_id;

  RETURN jsonb_build_object(
    'success', true,
    'kontakt_id', _kontakt_id,
    'email', _kontakt.email,
    'name', _expected_name,
    'email_hash', _email_hash
  );
END;
$$;