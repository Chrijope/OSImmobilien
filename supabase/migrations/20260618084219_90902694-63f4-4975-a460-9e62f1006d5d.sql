CREATE OR REPLACE FUNCTION public.set_zoom_connections_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE public.zoom_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  zoom_user_id text NOT NULL,
  zoom_account_id text,
  zoom_email text NOT NULL,
  zoom_display_name text,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  token_expires_at timestamptz NOT NULL,
  scopes text,
  status text NOT NULL DEFAULT 'active',
  last_refreshed_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.zoom_connections TO authenticated;
GRANT ALL ON public.zoom_connections TO service_role;

ALTER TABLE public.zoom_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own zoom connection"
  ON public.zoom_connections FOR ALL
  TO authenticated
  USING (auth.uid() = user_id OR public.is_admin_role(auth.uid()))
  WITH CHECK (auth.uid() = user_id OR public.is_admin_role(auth.uid()));

CREATE TRIGGER trg_zoom_connections_updated_at
  BEFORE UPDATE ON public.zoom_connections
  FOR EACH ROW EXECUTE FUNCTION public.set_zoom_connections_updated_at();

CREATE INDEX idx_zoom_connections_user_id ON public.zoom_connections(user_id);
CREATE INDEX idx_zoom_connections_expires ON public.zoom_connections(token_expires_at) WHERE status = 'active';