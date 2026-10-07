-- AI-Rate-Limit pro User/Tag
CREATE TABLE public.ai_rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_key text NOT NULL,
  tag date NOT NULL DEFAULT CURRENT_DATE,
  request_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_key, tag)
);

CREATE INDEX idx_ai_rate_limits_tag ON public.ai_rate_limits(tag);

ALTER TABLE public.ai_rate_limits ENABLE ROW LEVEL SECURITY;

-- Nur Admins lesen
CREATE POLICY "Admins can view ai_rate_limits"
ON public.ai_rate_limits FOR SELECT
TO authenticated
USING (public.is_admin_role(auth.uid()));

-- Service role darf alles (Edge Function)
-- (kein RLS für service role nötig - bypassed automatisch)

-- Atomare RPC: zählt hoch und gibt aktuellen Wert zurück
CREATE OR REPLACE FUNCTION public.increment_ai_rate_limit(_user_key text, _limit integer DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _new_count integer;
BEGIN
  INSERT INTO public.ai_rate_limits (user_key, tag, request_count)
  VALUES (_user_key, CURRENT_DATE, 1)
  ON CONFLICT (user_key, tag) DO UPDATE
    SET request_count = ai_rate_limits.request_count + 1,
        updated_at = now()
  RETURNING request_count INTO _new_count;

  RETURN jsonb_build_object(
    'count', _new_count,
    'limit', _limit,
    'exceeded', _new_count > _limit,
    'remaining', GREATEST(0, _limit - _new_count)
  );
END;
$$;

-- Auto-Cleanup: täglich Einträge älter als 30 Tage entfernen
CREATE OR REPLACE FUNCTION public.cleanup_ai_rate_limits()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE deleted_count bigint;
BEGIN
  DELETE FROM public.ai_rate_limits WHERE tag < CURRENT_DATE - INTERVAL '30 days';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;