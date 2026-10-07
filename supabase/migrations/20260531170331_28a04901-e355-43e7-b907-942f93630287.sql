-- Race-safe Claim-Funktion für offene Pool-Leads.
-- Setterin/Admin nimmt einen unzugewiesenen Lead in Bearbeitung.
-- Gewinnt der Erste; alle weiteren Aufrufe bekommen NULL zurück.
CREATE OR REPLACE FUNCTION public.claim_lead(_kontakt_id uuid, _via text DEFAULT 'manual')
RETURNS TABLE(success boolean, claimed_by uuid, claimed_by_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_name text;
  v_updated uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::text;
    RETURN;
  END IF;

  -- Nur interne Rollen dürfen claimen
  IF NOT public.is_internal_role(v_uid) THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::text;
    RETURN;
  END IF;

  SELECT name INTO v_name FROM public.profiles WHERE id = v_uid;

  -- Atomar nur dann zuweisen, wenn noch unzugewiesen
  UPDATE public.kontakte
     SET zustaendig_id = v_uid,
         berater = COALESCE(NULLIF(berater, ''), v_name),
         meta = COALESCE(meta, '{}'::jsonb)
                || jsonb_build_object(
                     'offenerLead', false,
                     'claimedAt', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
                     'claimedBy', v_uid::text,
                     'claimedByName', v_name,
                     'claimedVia', COALESCE(_via, 'manual')
                   )
   WHERE id = _kontakt_id
     AND zustaendig_id IS NULL
  RETURNING id INTO v_updated;

  IF v_updated IS NULL THEN
    -- Lead war schon übernommen – bestehende Zuweisung zurückgeben
    RETURN QUERY
    SELECT false, k.zustaendig_id, p.name
      FROM public.kontakte k
      LEFT JOIN public.profiles p ON p.id = k.zustaendig_id
     WHERE k.id = _kontakt_id;
    RETURN;
  END IF;

  -- Audit
  INSERT INTO public.audit_log (actor, action, entity, entity_id, meta)
  VALUES (v_uid, 'lead_claimed', 'kontakte', _kontakt_id::text,
          jsonb_build_object('via', COALESCE(_via, 'manual'), 'name', v_name));

  RETURN QUERY SELECT true, v_uid, v_name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_lead(uuid, text) TO authenticated;