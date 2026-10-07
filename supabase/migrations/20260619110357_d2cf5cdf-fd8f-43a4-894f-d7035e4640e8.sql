
-- RPC to allow the customer (anonymous, holding a valid SA token) to
-- continuously push their in-progress Selbstauskunft draft back to the system.
-- The data is stored on the token row (prefill_data) AND mirrored to the
-- linked investment's meta.saData so the VP sees an up-to-date snapshot when
-- they reopen "Online-Selbstauskunft ausfüllen" for that investment.
CREATE OR REPLACE FUNCTION public.update_sa_fill_token_data(_token text, _data jsonb)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row sa_fill_tokens%ROWTYPE;
  v_inv_id uuid;
BEGIN
  IF _token IS NULL OR _data IS NULL THEN
    RETURN false;
  END IF;

  SELECT * INTO v_row
  FROM sa_fill_tokens
  WHERE token = _token
  LIMIT 1;

  IF NOT FOUND THEN RETURN false; END IF;
  IF v_row.status <> 'pending' THEN RETURN false; END IF;
  IF v_row.expires_at < now() THEN RETURN false; END IF;

  UPDATE sa_fill_tokens
  SET prefill_data = _data
  WHERE id = v_row.id;

  -- Mirror to investment.meta.saData so the VP-side flow (which reads
  -- investments.meta.saData) reflects the customer's latest input one-to-one.
  BEGIN
    v_inv_id := NULLIF(v_row.investment_id, '')::uuid;
  EXCEPTION WHEN others THEN
    v_inv_id := NULL;
  END;

  IF v_inv_id IS NOT NULL THEN
    UPDATE investments
    SET meta = COALESCE(meta, '{}'::jsonb) || jsonb_build_object('saData', _data)
    WHERE id = v_inv_id;
  END IF;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_sa_fill_token_data(text, jsonb) TO anon, authenticated;
