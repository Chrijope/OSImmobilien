
-- 1. Mobile scan sessions: alte offene SELECT-Policy entfernen (Lesen via RPC)
DROP POLICY IF EXISTS "Public read by token" ON public.mobile_scan_sessions;

-- 2. Signature requests: offene UPDATE-Policy entfernen + RPC für signieren
DROP POLICY IF EXISTS "Token-basiert signieren v2" ON public.signature_requests;

CREATE OR REPLACE FUNCTION public.sign_signature_request(
  _token text,
  _signature_data text,
  _consent_text text,
  _user_agent text DEFAULT NULL
)
RETURNS public.signature_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _row public.signature_requests;
BEGIN
  UPDATE public.signature_requests
  SET status = 'signed',
      signed_at = now(),
      signature_data = _signature_data,
      consent_text = _consent_text,
      user_agent = COALESCE(_user_agent, user_agent)
  WHERE token = _token
    AND expires_at > now()
    AND status = 'pending'
  RETURNING * INTO _row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid, expired or already-signed signature request';
  END IF;

  RETURN _row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sign_signature_request(text, text, text, text) TO anon, authenticated;

-- 3. selbstauskunft-pdfs Storage INSERT: nur interne Rollen oder Kontaktinhaber in eigenen Pfad
DROP POLICY IF EXISTS "Allow insert for selbstauskunft PDFs" ON storage.objects;

CREATE POLICY "SA-PDFs: internal or owner insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'selbstauskunft-pdfs'
  AND (
    public.is_internal_role(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.kontakte k
      WHERE k.id::text = (storage.foldername(name))[1]
        AND (
          (k.meta ->> 'authUserId') = auth.uid()::text
          OR ((k.meta -> 'person2') ->> 'authUserId') = auth.uid()::text
        )
    )
  )
);

-- 4. user_roles: eigene Rollen sichtbar, intern alle
DROP POLICY IF EXISTS "Nutzer sehen eigene Rollen" ON public.user_roles;

CREATE POLICY "Nutzer sehen eigene Rollen"
ON public.user_roles
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR public.is_internal_role(auth.uid())
);

-- 5. pipeline: eigene Einträge sichtbar, intern alle
DROP POLICY IF EXISTS "Nutzer sehen alle Pipeline-Einträge" ON public.pipeline;

CREATE POLICY "Nutzer sehen eigene Pipeline-Einträge"
ON public.pipeline
FOR SELECT
TO authenticated
USING (
  auth.uid() = benutzer_id
  OR public.is_internal_role(auth.uid())
);
