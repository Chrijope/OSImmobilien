-- Session-Hijacking-Detection: erweitere login_sessions um Geo + Anomalie-Felder
ALTER TABLE public.login_sessions
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS anomaly_level text,
  ADD COLUMN IF NOT EXISTS anomaly_reason text,
  ADD COLUMN IF NOT EXISTS alert_sent_at timestamptz;

-- Constraint auf gültige Levels
DO $$ BEGIN
  ALTER TABLE public.login_sessions
    ADD CONSTRAINT login_sessions_anomaly_level_check
    CHECK (anomaly_level IS NULL OR anomaly_level IN ('low','medium','critical'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Indizes für Detection-Queries und Admin-UI
CREATE INDEX IF NOT EXISTS login_sessions_user_loggedin_idx
  ON public.login_sessions (user_id, logged_in_at DESC);

CREATE INDEX IF NOT EXISTS login_sessions_anomaly_idx
  ON public.login_sessions (anomaly_level, logged_in_at DESC)
  WHERE anomaly_level IS NOT NULL;