
CREATE TABLE public.login_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  browser TEXT,
  os TEXT,
  ip_address TEXT,
  user_agent TEXT,
  logged_in_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  aktiv BOOLEAN NOT NULL DEFAULT true
);

ALTER TABLE public.login_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Nutzer sehen eigene Sessions"
  ON public.login_sessions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Auth erstellt Sessions"
  ON public.login_sessions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Nutzer aktualisieren eigene Sessions"
  ON public.login_sessions FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Nutzer löschen eigene Sessions"
  ON public.login_sessions FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
