-- Spalte für SA-Reminder-Tracking
ALTER TABLE public.sa_fill_tokens
  ADD COLUMN IF NOT EXISTS reminder_sent_at timestamp with time zone;

CREATE INDEX IF NOT EXISTS idx_sa_fill_tokens_pending_reminder
  ON public.sa_fill_tokens (status, created_at)
  WHERE status = 'pending' AND reminder_sent_at IS NULL;
