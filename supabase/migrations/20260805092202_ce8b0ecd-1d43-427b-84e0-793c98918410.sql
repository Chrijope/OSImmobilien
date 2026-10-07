ALTER TABLE public.signature_requests
  ADD COLUMN IF NOT EXISTS meta jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.signature_requests.meta IS
  'Zusatzinformationen, u.a. erinnert_at und aufgabe_at fuer die Function signatur-erinnerung.';