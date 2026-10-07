
-- Table for SA fill invitation tokens
CREATE TABLE public.sa_fill_tokens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  kontakt_id TEXT NOT NULL,
  investment_id TEXT NOT NULL,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

ALTER TABLE public.sa_fill_tokens ENABLE ROW LEVEL SECURITY;

-- Public can read by token (for the customer accessing the form)
CREATE POLICY "Public token access"
  ON public.sa_fill_tokens FOR SELECT
  USING (true);

-- Internal roles can insert
CREATE POLICY "Internal users can create tokens"
  ON public.sa_fill_tokens FOR INSERT
  TO authenticated
  WITH CHECK (public.is_internal_role(auth.uid()));

-- Internal roles can update (mark as used)
CREATE POLICY "Internal users can update tokens"
  ON public.sa_fill_tokens FOR UPDATE
  TO authenticated
  USING (public.is_internal_role(auth.uid()));

-- Allow anon update for the public page to mark token as used
CREATE POLICY "Anon can mark token used"
  ON public.sa_fill_tokens FOR UPDATE
  TO anon
  USING (status = 'pending' AND expires_at > now());
