-- Tokens can only be read/written through authenticated server functions.
REVOKE ALL ON public.vp_marketing_einstellungen FROM anon, authenticated, public;
GRANT ALL ON public.vp_marketing_einstellungen TO service_role;

-- Short-lived, opaque receipts. Only hashed event data, no browser access.
CREATE TABLE IF NOT EXISTS public.meta_lead_freigaben (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pixel_id text NOT NULL,
  event jsonb NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '10 minutes'
);
CREATE INDEX IF NOT EXISTS meta_lead_freigaben_expires ON public.meta_lead_freigaben(expires_at);
ALTER TABLE public.meta_lead_freigaben ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.meta_lead_freigaben FROM anon, authenticated, public;
GRANT ALL ON public.meta_lead_freigaben TO service_role;
