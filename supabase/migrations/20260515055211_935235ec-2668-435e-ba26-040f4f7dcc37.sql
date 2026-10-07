
CREATE OR REPLACE FUNCTION public.set_mss_updated_at_fn()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE public.mobile_scan_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE,
  kontakt_id uuid NOT NULL,
  investment_id uuid,
  person integer NOT NULL DEFAULT 1,
  block text NOT NULL DEFAULT 'bonitaet',
  status text NOT NULL DEFAULT 'offen',
  last_doc_typ text,
  last_upload_at timestamptz,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '1 hour'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_mss_token ON public.mobile_scan_sessions(token);
CREATE INDEX idx_mss_kontakt ON public.mobile_scan_sessions(kontakt_id);

ALTER TABLE public.mobile_scan_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read by token" ON public.mobile_scan_sessions
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Public update by token" ON public.mobile_scan_sessions
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Internal and customer insert" ON public.mobile_scan_sessions
  FOR INSERT TO authenticated WITH CHECK (
    is_internal_role(auth.uid()) OR
    EXISTS (
      SELECT 1 FROM public.kontakte k
      WHERE k.id = mobile_scan_sessions.kontakt_id
        AND (((k.meta ->> 'authUserId') = (auth.uid())::text)
          OR (((k.meta -> 'person2') ->> 'authUserId') = (auth.uid())::text))
    )
  );

CREATE POLICY "Admin delete" ON public.mobile_scan_sessions
  FOR DELETE TO authenticated USING (is_admin_role(auth.uid()));

CREATE TRIGGER set_mss_updated_at
  BEFORE UPDATE ON public.mobile_scan_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_mss_updated_at_fn();

ALTER TABLE public.mobile_scan_sessions REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.mobile_scan_sessions;

CREATE POLICY "Anon upload via active scan session"
  ON storage.objects
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    bucket_id = 'bonitaet'
    AND EXISTS (
      SELECT 1 FROM public.mobile_scan_sessions s
      WHERE s.token = (storage.foldername(name))[1]
        AND s.expires_at > now()
        AND s.status = 'offen'
    )
  );
