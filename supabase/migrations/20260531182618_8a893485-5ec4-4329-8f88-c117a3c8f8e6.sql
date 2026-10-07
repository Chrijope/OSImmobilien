-- Rate-Limit-Tabelle: ein Bucket pro (user_key, scope, window)
CREATE TABLE IF NOT EXISTS public.rate_limit_buckets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_key TEXT NOT NULL,
  scope TEXT NOT NULL,
  window_kind TEXT NOT NULL CHECK (window_kind IN ('hour','day')),
  window_start TIMESTAMPTZ NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_key, scope, window_kind, window_start)
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_buckets_lookup
  ON public.rate_limit_buckets (user_key, scope, window_kind, window_start);

GRANT ALL ON public.rate_limit_buckets TO service_role;

ALTER TABLE public.rate_limit_buckets ENABLE ROW LEVEL SECURITY;

-- Kein Zugriff für anon/authenticated; nur service_role über die RPC.
CREATE POLICY "service_role manages rate_limit_buckets"
ON public.rate_limit_buckets
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Atomar: zählt hoch und gibt aktuellen Stand zurück.
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  _user_key TEXT,
  _scope TEXT,
  _limit_per_hour INTEGER DEFAULT NULL,
  _limit_per_day INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _hour_start TIMESTAMPTZ := date_trunc('hour', now());
  _day_start  TIMESTAMPTZ := date_trunc('day', now());
  _hour_count INTEGER := 0;
  _day_count  INTEGER := 0;
  _exceeded BOOLEAN := false;
  _reason TEXT := NULL;
BEGIN
  IF _limit_per_hour IS NOT NULL THEN
    INSERT INTO public.rate_limit_buckets(user_key, scope, window_kind, window_start, request_count)
    VALUES (_user_key, _scope, 'hour', _hour_start, 1)
    ON CONFLICT (user_key, scope, window_kind, window_start)
    DO UPDATE SET request_count = rate_limit_buckets.request_count + 1,
                  updated_at = now()
    RETURNING request_count INTO _hour_count;

    IF _hour_count > _limit_per_hour THEN
      _exceeded := true;
      _reason := 'hour';
    END IF;
  END IF;

  IF _limit_per_day IS NOT NULL THEN
    INSERT INTO public.rate_limit_buckets(user_key, scope, window_kind, window_start, request_count)
    VALUES (_user_key, _scope, 'day', _day_start, 1)
    ON CONFLICT (user_key, scope, window_kind, window_start)
    DO UPDATE SET request_count = rate_limit_buckets.request_count + 1,
                  updated_at = now()
    RETURNING request_count INTO _day_count;

    IF _day_count > _limit_per_day THEN
      _exceeded := true;
      _reason := COALESCE(_reason, 'day');
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'exceeded', _exceeded,
    'reason', _reason,
    'hour_count', _hour_count,
    'day_count', _day_count,
    'limit_per_hour', _limit_per_hour,
    'limit_per_day', _limit_per_day,
    'remaining_hour', CASE WHEN _limit_per_hour IS NULL THEN NULL
                           ELSE GREATEST(0, _limit_per_hour - _hour_count) END,
    'remaining_day',  CASE WHEN _limit_per_day  IS NULL THEN NULL
                           ELSE GREATEST(0, _limit_per_day  - _day_count)  END
  );
END;
$$;

-- Cleanup alter Buckets (>7 Tage)
CREATE OR REPLACE FUNCTION public.cleanup_rate_limit_buckets()
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE deleted_count BIGINT;
BEGIN
  DELETE FROM public.rate_limit_buckets
  WHERE window_start < now() - interval '7 days';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;