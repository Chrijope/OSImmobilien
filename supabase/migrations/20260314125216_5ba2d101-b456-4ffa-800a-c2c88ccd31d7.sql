-- Add meta column to tables that need it for extra fields
ALTER TABLE public.news ADD COLUMN IF NOT EXISTS meta jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS meta jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.bewerbungen ADD COLUMN IF NOT EXISTS meta jsonb DEFAULT '{}'::jsonb;