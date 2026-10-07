-- DSGVO-Sofortlöschung: immutable Audit-Tabelle + RPC

-- 1) dsgvo_deletion_log: immutable Nachweis für Aufsichtsbehörde
CREATE TABLE public.dsgvo_deletion_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_hash text NOT NULL,
  name_hash text NOT NULL,
  kontakt_id uuid NOT NULL,
  geloeschtVon uuid,
  geloeschtVon_name text,
  grund_referenz text NOT NULL,
  geloescht_am timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_dsgvo_deletion_log_email_hash ON public.dsgvo_deletion_log(email_hash);
CREATE INDEX idx_dsgvo_deletion_log_geloescht_am ON public.dsgvo_deletion_log(geloescht_am DESC);

GRANT SELECT, INSERT ON public.dsgvo_deletion_log TO authenticated;
GRANT ALL ON public.dsgvo_deletion_log TO service_role;

ALTER TABLE public.dsgvo_deletion_log ENABLE ROW LEVEL SECURITY;

-- Nur Admin/Inhaber dürfen das Log lesen
CREATE POLICY "Admins können DSGVO-Log lesen"
ON public.dsgvo_deletion_log FOR SELECT
TO authenticated
USING (public.is_admin_role(auth.uid()));

-- Insert nur via SECURITY DEFINER RPC (kein direkter Insert)
CREATE POLICY "Niemand darf direkt inserten"
ON public.dsgvo_deletion_log FOR INSERT
TO authenticated
WITH CHECK (false);

-- Update/Delete für niemanden (immutable)
-- (keine Policies = automatisch verboten)

-- 2) RPC: DSGVO-Sofortlöschung
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
  _file_paths jsonb;
  _email_hash text;
  _name_hash text;
  _actor_name text;
BEGIN
  -- Berechtigung: nur Admin/Inhaber
  IF NOT public.is_admin_role(auth.uid()) THEN
    RAISE EXCEPTION 'Nur Admin oder Inhaber dürfen die DSGVO-Sofortlöschung ausführen';
  END IF;

  -- Pflichtfeld
  IF _grund_referenz IS NULL OR length(trim(_grund_referenz)) < 3 THEN
    RAISE EXCEPTION 'Pflichtfeld Grund-Referenz fehlt';
  END IF;

  -- Kontakt laden
  SELECT * INTO _kontakt FROM public.kontakte WHERE id = _kontakt_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kontakt nicht gefunden';
  END IF;

  -- Namens-Bestätigung verifizieren
  _expected_name := trim(coalesce(_kontakt.vorname, '') || ' ' || coalesce(_kontakt.nachname, ''));
  IF lower(trim(coalesce(_name_confirmation, ''))) <> lower(_expected_name) THEN
    RAISE EXCEPTION 'Namens-Bestätigung stimmt nicht überein';
  END IF;

  -- Hashes für Nachweis (SHA-256)
  _email_hash := encode(extensions.digest(lower(coalesce(_kontakt.email, '')), 'sha256'), 'hex');
  _name_hash := encode(extensions.digest(lower(_expected_name), 'sha256'), 'hex');

  SELECT name INTO _actor_name FROM public.profiles WHERE id = auth.uid();

  -- Storage-Pfade sammeln (Rückgabe an Edge-Function für Cleanup)
  _file_paths := jsonb_build_object(
    'kontakt_id', _kontakt_id::text,
    'email', _kontakt.email
  );

  -- Audit-Log PII-Maskierung: alle Einträge dieses Kontakts anonymisieren
  UPDATE public.audit_log
  SET vorher = CASE WHEN vorher IS NOT NULL THEN jsonb_build_object('redacted', '[GELÖSCHT DSGVO]') ELSE NULL END,
      nachher = CASE WHEN nachher IS NOT NULL THEN jsonb_build_object('redacted', '[GELÖSCHT DSGVO]') ELSE NULL END,
      actor_email = CASE WHEN actor_email = _kontakt.email THEN '[GELÖSCHT DSGVO]' ELSE actor_email END
  WHERE entity = 'kontakte' AND entity_id = _kontakt_id::text;

  -- Immutable Log-Eintrag (bypass RLS via SECURITY DEFINER)
  INSERT INTO public.dsgvo_deletion_log
    (kontakt_id, email_hash, name_hash, geloeschtVon, geloeschtVon_name, grund_referenz)
  VALUES
    (_kontakt_id, _email_hash, _name_hash, auth.uid(), _actor_name, _grund_referenz);

  -- Audit-Log-Eintrag für die Löschung selbst (vor dem Delete)
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

  -- Verknüpfte Daten löschen (CASCADE-Trigger erledigt investments)
  DELETE FROM public.aktivitaeten WHERE kunde_id = _kontakt_id::text;
  DELETE FROM public.benachrichtigungen WHERE link LIKE '%' || _kontakt_id::text || '%';
  DELETE FROM public.follow_ups WHERE kontakt_id = _kontakt_id;
  DELETE FROM public.notizen WHERE kontakt_id = _kontakt_id;
  DELETE FROM public.aufgaben WHERE kontakt_id = _kontakt_id;
  DELETE FROM public.sa_fill_tokens WHERE kontakt_id = _kontakt_id;

  -- Kontakt selbst löschen (Trigger cascade_delete_investments_on_kontakt feuert)
  DELETE FROM public.kontakte WHERE id = _kontakt_id;

  RETURN jsonb_build_object(
    'success', true,
    'kontakt_id', _kontakt_id,
    'email', _kontakt.email,
    'name', _expected_name,
    'email_hash', _email_hash,
    'file_paths', _file_paths
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.dsgvo_hard_delete_kontakt(uuid, text, text) TO authenticated;