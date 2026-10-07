CREATE OR REPLACE FUNCTION public.update_sa_fill_token_data(_token text, _data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_token_row sa_fill_tokens%ROWTYPE;
BEGIN
  SELECT * INTO v_token_row FROM sa_fill_tokens WHERE token = _token;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found');
  END IF;
  IF v_token_row.status <> 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_pending');
  END IF;
  IF v_token_row.expires_at < now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'expired');
  END IF;

  UPDATE sa_fill_tokens
     SET prefill_data = _data,
         updated_at = now()
   WHERE token = _token;

  IF v_token_row.investment_id IS NOT NULL AND v_token_row.investment_id <> '' THEN
    BEGIN
      UPDATE investments
         SET meta = COALESCE(meta, '{}'::jsonb) || jsonb_build_object('saData', _data),
             updated_at = now()
       WHERE id = v_token_row.investment_id::uuid
         AND COALESCE((meta->>'abgeschlossen')::boolean, false) = false;
    EXCEPTION WHEN invalid_text_representation THEN
      -- investment_id ist keine gültige UUID -> ignorieren, Token-Update bleibt bestehen
      NULL;
    END;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$function$;