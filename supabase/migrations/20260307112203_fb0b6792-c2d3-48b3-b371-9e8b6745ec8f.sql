
ALTER TABLE public.kontakte DROP COLUMN IF EXISTS typ;
ALTER TABLE public.anrufe DROP COLUMN IF EXISTS typ;
DROP TYPE IF EXISTS public.kontakt_typ;
