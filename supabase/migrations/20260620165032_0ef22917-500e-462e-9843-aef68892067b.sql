
-- Push subscriptions per user/device
CREATE TABLE public.push_subscriptions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (endpoint)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own push subs"
  ON public.push_subscriptions FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX push_subscriptions_user_id_idx ON public.push_subscriptions(user_id);

-- Trigger: when a notification is inserted, call send-web-push edge function
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.trigger_send_web_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_user uuid;
  notif_title text;
  notif_body text;
  notif_url text;
BEGIN
  target_user := NEW.user_id;
  notif_title := COALESCE(NEW.titel, 'MOREImmo');
  notif_body  := COALESCE(NEW.nachricht, '');
  notif_url   := COALESCE(NEW.link, '/');

  IF target_user IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := 'https://irwdgutegmivbtgmftyc.supabase.co/functions/v1/send-web-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'DEIN-ANON-KEY'
    ),
    body := jsonb_build_object(
      'user_id', target_user,
      'title', notif_title,
      'body', notif_body,
      'url', notif_url,
      'tag', COALESCE(NEW.id::text, '')
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS benachrichtigungen_web_push ON public.benachrichtigungen;
CREATE TRIGGER benachrichtigungen_web_push
  AFTER INSERT ON public.benachrichtigungen
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_send_web_push();
