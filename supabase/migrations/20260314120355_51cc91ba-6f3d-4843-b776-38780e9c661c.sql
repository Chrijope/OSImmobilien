CREATE TABLE public.user_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  einstellungen jsonb DEFAULT '{}'::jsonb,
  unterlagen jsonb DEFAULT '[]'::jsonb,
  closer_list jsonb DEFAULT '[]'::jsonb,
  onboarding_steps jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own settings"
ON public.user_settings FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users insert own settings"
ON public.user_settings FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own settings"
ON public.user_settings FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);