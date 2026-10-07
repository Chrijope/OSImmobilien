
-- Add meta column to chat tables for extra fields
ALTER TABLE public.chat_gruppen ADD COLUMN IF NOT EXISTS meta jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.chat_nachrichten ADD COLUMN IF NOT EXISTS meta jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.chat_teilnehmer ADD COLUMN IF NOT EXISTS meta jsonb DEFAULT '{}'::jsonb;
