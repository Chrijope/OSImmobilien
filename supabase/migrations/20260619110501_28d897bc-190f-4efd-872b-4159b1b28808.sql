
CREATE OR REPLACE FUNCTION public.update_sa_fill_token_data(_token text, _data jsonb)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row sa_fill_tokens%ROWTYPE;
  v_kontakt_id uuid;
BEGIN
  IF _token IS NULL OR _data IS NULL THEN
    RETURN false;
  END IF;

  SELECT * INTO v_row FROM sa_fill_tokens WHERE token = _token LIMIT 1;

  IF NOT FOUND THEN RETURN false; END IF;
  IF v_row.status <> 'pending' THEN RETURN false; END IF;
  IF v_row.expires_at < now() THEN RETURN false; END IF;

  UPDATE sa_fill_tokens
  SET prefill_data = _data
  WHERE id = v_row.id;

  -- Kunden-bezogene Spiegelung: SA-Inhalte werden in ALLE Investments dieses
  -- Kunden geschrieben (nur Inhalte, NICHT Signatur/abgeschlossen-Status).
  BEGIN
    v_kontakt_id := NULLIF(v_row.kontakt_id, '')::uuid;
  EXCEPTION WHEN others THEN
    v_kontakt_id := NULL;
  END;

  IF v_kontakt_id IS NOT NULL THEN
    UPDATE investments
    SET meta = COALESCE(meta, '{}'::jsonb) || jsonb_build_object('saData', _data)
    WHERE kontakt_id = v_kontakt_id
      -- Bereits unterschriebene SA nicht überschreiben (Schutz vor Datenverlust nach Signatur)
      AND COALESCE(((meta->'saData')->>'abgeschlossen')::boolean, false) = false;
  END IF;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_sa_fill_token_data(text, jsonb) TO anon, authenticated;
