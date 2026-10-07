
ALTER TABLE kontakte ADD COLUMN IF NOT EXISTS meta jsonb DEFAULT '{}'::jsonb;
ALTER TABLE wohnungen ADD COLUMN IF NOT EXISTS meta jsonb DEFAULT '{}'::jsonb;
