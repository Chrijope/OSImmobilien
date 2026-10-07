
CREATE OR REPLACE FUNCTION public.log_audit_event(
  _action text,
  _entity text,
  _entity_id text DEFAULT NULL,
  _vorher jsonb DEFAULT NULL,
  _nachher jsonb DEFAULT NULL,
  _meta jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id uuid;
  _email text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF NOT (public.is_internal_role(auth.uid()) OR public.is_admin_role(auth.uid())) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT email INTO _email FROM auth.users WHERE id = auth.uid();

  INSERT INTO public.audit_log (action, entity, entity_id, vorher, nachher, meta, actor, actor_email)
  VALUES (_action, _entity, _entity_id, _vorher, _nachher, COALESCE(_meta, '{}'::jsonb), auth.uid(), _email)
  RETURNING id INTO _id;

  RETURN _id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_audit_event(text, text, text, jsonb, jsonb, jsonb) TO authenticated;
