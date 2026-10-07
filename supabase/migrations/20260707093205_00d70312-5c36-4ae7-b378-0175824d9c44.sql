
-- Scheduled notifications: server-side reminder queue for VP notifications
CREATE TABLE public.scheduled_notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  target_user_id UUID NOT NULL,
  target_role TEXT,
  titel TEXT NOT NULL,
  nachricht TEXT NOT NULL DEFAULT '',
  link TEXT,
  category TEXT,
  trigger_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  kontakt_id UUID,
  investment_id UUID,
  skip_condition TEXT,
  dedupe_key TEXT,
  erstellt_am TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  error TEXT
);

CREATE INDEX idx_scheduled_notifications_pending ON public.scheduled_notifications (status, trigger_at) WHERE status = 'pending';
CREATE UNIQUE INDEX idx_scheduled_notifications_dedupe ON public.scheduled_notifications (dedupe_key) WHERE dedupe_key IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.scheduled_notifications TO authenticated;
GRANT ALL ON public.scheduled_notifications TO service_role;

ALTER TABLE public.scheduled_notifications ENABLE ROW LEVEL SECURITY;

-- Any authenticated internal user may schedule a notification
CREATE POLICY "auth_insert_scheduled_notifications"
  ON public.scheduled_notifications FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- Users can see their own scheduled notifications; admins see all
CREATE POLICY "auth_select_scheduled_notifications"
  ON public.scheduled_notifications FOR SELECT TO authenticated
  USING (target_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'inhaber'));

-- Only admins can delete
CREATE POLICY "admin_delete_scheduled_notifications"
  ON public.scheduled_notifications FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'inhaber'));

-- Cron: process due reminders every minute
SELECT cron.schedule(
  'process-scheduled-notifications-every-minute',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://irwdgutegmivbtgmftyc.supabase.co/functions/v1/process-scheduled-notifications',
    headers := '{"Content-Type":"application/json","apikey":"DEIN-ANON-KEY"}'::jsonb,
    body := jsonb_build_object('time', now())
  );
  $$
);
