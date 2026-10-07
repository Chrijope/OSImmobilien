CREATE OR REPLACE FUNCTION public.jsonb_deep_merge(a jsonb, b jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN jsonb_typeof(a) = 'object' AND jsonb_typeof(b) = 'object' THEN (
      SELECT jsonb_object_agg(key, value)
      FROM (
        SELECT
          COALESCE(ak.key, bk.key) AS key,
          CASE
            WHEN ak.value IS NULL THEN bk.value
            WHEN bk.value IS NULL THEN ak.value
            WHEN jsonb_typeof(ak.value) = 'object' AND jsonb_typeof(bk.value) = 'object'
              THEN public.jsonb_deep_merge(ak.value, bk.value)
            ELSE bk.value
          END AS value
        FROM jsonb_each(a) ak
        FULL JOIN jsonb_each(b) bk ON ak.key = bk.key
      ) merged
    )
    ELSE COALESCE(b, a)
  END;
$$;

CREATE OR REPLACE FUNCTION public.merge_user_settings(_user_id uuid, _patch jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _result jsonb;
  _existing_id uuid;
  _existing_settings jsonb := '{}'::jsonb;
  _is_provision_change boolean := false;
  _is_locked boolean;
  _caller_is_admin boolean;
  _provision_key text;
BEGIN
  IF auth.uid() <> _user_id AND NOT public.is_admin_role(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized to update user_settings for this user';
  END IF;

  _caller_is_admin := public.is_admin_role(auth.uid());

  SELECT id,
         COALESCE(einstellungen, '{}'::jsonb),
         COALESCE((einstellungen->>'provision_locked')::boolean, false)
    INTO _existing_id, _existing_settings, _is_locked
  FROM public.user_settings
  WHERE user_id = _user_id;

  FOREACH _provision_key IN ARRAY ARRAY[
    'custom_provision_rate',
    'custom_provision_rate_setter',
    'custom_provision_rate_eigen',
    'karriere_override'
  ] LOOP
    IF _patch ? _provision_key
       AND COALESCE(_patch-> _provision_key, 'null'::jsonb) IS DISTINCT FROM COALESCE(_existing_settings-> _provision_key, 'null'::jsonb) THEN
      _is_provision_change := true;
    END IF;
  END LOOP;

  IF _is_provision_change AND _is_locked AND NOT _caller_is_admin THEN
    RAISE EXCEPTION 'Provisionssätze sind festgeschrieben und können nur vom Inhaber geändert werden';
  END IF;

  IF _existing_id IS NOT NULL THEN
    UPDATE public.user_settings
    SET einstellungen = public.jsonb_deep_merge(COALESCE(einstellungen, '{}'::jsonb), COALESCE(_patch, '{}'::jsonb)),
        updated_at = now()
    WHERE id = _existing_id
    RETURNING einstellungen INTO _result;
  ELSE
    INSERT INTO public.user_settings (user_id, einstellungen)
    VALUES (_user_id, COALESCE(_patch, '{}'::jsonb))
    RETURNING einstellungen INTO _result;
  END IF;

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
$function$;