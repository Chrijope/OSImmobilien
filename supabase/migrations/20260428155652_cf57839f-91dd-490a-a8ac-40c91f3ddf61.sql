
-- Atomare Merge-RPC für user_settings.einstellungen, analog zu merge_kontakt_meta
-- Verhindert, dass parallele Schreibvorgänge sich gegenseitig überschreiben.
CREATE OR REPLACE FUNCTION public.merge_user_settings(_user_id uuid, _patch jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _result jsonb;
  _existing_id uuid;
  _is_provision_change boolean;
  _is_locked boolean;
  _caller_is_admin boolean;
BEGIN
  -- Berechtigung: nur eigener User ODER Admin/Inhaber
  IF auth.uid() <> _user_id AND NOT public.is_admin_role(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized to update user_settings for this user';
  END IF;

  _caller_is_admin := public.is_admin_role(auth.uid());

  -- Prüfen ob Provisions-Felder geändert werden
  _is_provision_change := (
    _patch ? 'custom_provision_rate' OR
    _patch ? 'custom_provision_rate_setter' OR
    _patch ? 'custom_provision_rate_eigen' OR
    _patch ? 'karriere_override'
  );

  SELECT id, COALESCE((einstellungen->>'provision_locked')::boolean, false)
    INTO _existing_id, _is_locked
  FROM public.user_settings
  WHERE user_id = _user_id;

  -- Wenn Provisionsdaten gesperrt: nur Admin/Inhaber darf ändern
  IF _is_provision_change AND _is_locked AND NOT _caller_is_admin THEN
    RAISE EXCEPTION 'Provisionssätze sind festgeschrieben und können nur vom Inhaber geändert werden';
  END IF;

  IF _existing_id IS NOT NULL THEN
    UPDATE public.user_settings
    SET einstellungen = COALESCE(einstellungen, '{}'::jsonb) || _patch,
        updated_at = now()
    WHERE id = _existing_id
    RETURNING einstellungen INTO _result;
  ELSE
    INSERT INTO public.user_settings (user_id, einstellungen)
    VALUES (_user_id, _patch)
    RETURNING einstellungen INTO _result;
  END IF;

  -- Audit-Log bei Provisions-Änderung
  IF _is_provision_change THEN
    INSERT INTO public.aktivitaeten (art, kunde_id, beschreibung, details, von, benutzer_id)
    VALUES (
      'system',
      'user_settings_audit',
      'Provisionssätze geändert für user ' || _user_id::text,
      jsonb_build_object(
        'user_id', _user_id,
        'patch', _patch,
        'changed_by', auth.uid(),
        'is_admin', _caller_is_admin,
        'was_locked', _is_locked
      )::text,
      COALESCE(auth.uid()::text, 'system'),
      auth.uid()
    );
  END IF;

  RETURN COALESCE(_result, '{}'::jsonb);
END;
$$;
