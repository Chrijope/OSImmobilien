ALTER TABLE public.sa_fill_tokens
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION public.tg_sa_fill_tokens_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sa_fill_tokens_updated_at ON public.sa_fill_tokens;
CREATE TRIGGER trg_sa_fill_tokens_updated_at
  BEFORE UPDATE ON public.sa_fill_tokens
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_sa_fill_tokens_touch_updated_at();