-- Neues Feld für VP-Microseiten-Slug
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS vp_slug text UNIQUE;

CREATE INDEX IF NOT EXISTS idx_profiles_vp_slug ON public.profiles(vp_slug) WHERE vp_slug IS NOT NULL;

-- Backfill für alle bestehenden Vertriebspartner (und Admins/Inhaber)
DO $$
DECLARE
  prof RECORD;
  base_slug text;
  candidate text;
  counter int;
BEGIN
  FOR prof IN
    SELECT p.id, p.name
    FROM public.profiles p
    WHERE p.vp_slug IS NULL
      AND EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = p.id
          AND ur.role IN ('vertriebspartner', 'admin', 'inhaber')
      )
      AND p.name IS NOT NULL
      AND length(trim(p.name)) > 0
  LOOP
    base_slug := lower(regexp_replace(
      translate(prof.name, 'äöüÄÖÜßéèêàâ', 'aouAOUseeeaa'),
      '[^a-z0-9]+', '-', 'g'
    ));
    base_slug := regexp_replace(base_slug, '^-+|-+$', '', 'g');
    
    IF base_slug = '' THEN CONTINUE; END IF;
    
    candidate := base_slug;
    counter := 1;
    
    WHILE EXISTS (SELECT 1 FROM public.profiles WHERE vp_slug = candidate) LOOP
      counter := counter + 1;
      candidate := base_slug || '-' || counter;
    END LOOP;
    
    UPDATE public.profiles SET vp_slug = candidate WHERE id = prof.id;
  END LOOP;
END $$;